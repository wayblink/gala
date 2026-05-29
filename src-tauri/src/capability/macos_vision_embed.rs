//! macOS Vision face.embed provider.
//!
//! Uses VNGenerateImageFeaturePrintRequest on a face-cropped region of the
//! source image. The crop is derived from the bbox stored in AnalyzeInput.meta
//! (populated by the face.embed command's resolve_faces_for_embed helper).
//!
//! Output: one Artifact per face containing the raw feature print bytes
//! (Float32 elements, typically 128 or 2048 dimensions depending on the
//! Vision revision). The result JSON records { dim, element_type, face_id }.

#![cfg(target_os = "macos")]

use std::path::Path;

use async_trait::async_trait;
use image::GenericImageView;
use objc2::AnyThread;
use objc2::rc::Retained;
use objc2_foundation::{NSArray, NSData, NSString, NSURL};
use objc2_vision::{VNGenerateImageFeaturePrintRequest, VNImageRequestHandler, VNRequest};
use serde_json::json;

use super::types::{
    AnalyzeContext, AnalyzeInput, AnalyzeOutput, Artifact, CapabilityError, CapabilityId,
    ProviderId,
};
use super::CapabilityProvider;

pub const PROVIDER_ID: &str = "macos.vision.embed.v1";
pub const FACE_EMBED: &str = "face.embed";

pub struct MacosVisionEmbedProvider;

impl MacosVisionEmbedProvider {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl CapabilityProvider for MacosVisionEmbedProvider {
    fn id(&self) -> ProviderId {
        PROVIDER_ID.to_string()
    }

    fn capabilities(&self) -> &'static [CapabilityId] {
        &[FACE_EMBED]
    }

    fn schema_version(&self, _capability: CapabilityId) -> u32 {
        1
    }

    async fn analyze(
        &self,
        _ctx: &AnalyzeContext,
        capability: CapabilityId,
        input: &AnalyzeInput,
    ) -> Result<AnalyzeOutput, CapabilityError> {
        if capability != FACE_EMBED {
            return Err(CapabilityError::InvalidInput(format!(
                "{} not supported by {}",
                capability, PROVIDER_ID
            )));
        }

        // meta must contain { faces: [{ face_id, bbox: [x,y,w,h] }] }
        let faces_meta = input
            .meta
            .get("faces")
            .and_then(|v| v.as_array())
            .ok_or_else(|| {
                CapabilityError::InvalidInput("meta.faces array required for face.embed".into())
            })?;

        if faces_meta.is_empty() {
            return Ok(AnalyzeOutput {
                capability,
                provider_id: PROVIDER_ID.to_string(),
                schema_version: 1,
                result: json!({ "embeddings": [] }),
                confidence: None,
                artifacts: Vec::new(),
            });
        }

        // Parse the face list into owned (face_id, bbox) pairs in the async
        // context (cheap serde reads), then hand the heavy Vision crops +
        // feature-print loop to the blocking pool in one shot so a big
        // embed job doesn't tie up a tokio worker. objc2 objects live
        // entirely inside generate_embedding; only owned Send values cross
        // the spawn_blocking boundary.
        let total = faces_meta.len();
        // Parse into owned (face_id, bbox) pairs, severing the borrow on
        // `input` so the owned data can move into spawn_blocking. The
        // metadata array is tiny (a handful of faces), so this collect is
        // negligible compared to the Vision crops it feeds.
        let parsed: Vec<(String, [f64; 4])> = faces_meta
            .iter()
            .filter_map(|face| {
                let face_id = face.get("face_id").and_then(|v| v.as_str())?.to_string();
                let b = face.get("bbox").and_then(|v| v.as_array())?;
                if b.len() != 4 {
                    eprintln!("[embed] skipping face {} — invalid bbox", face_id);
                    return None;
                }
                Some((
                    face_id,
                    [
                        b[0].as_f64().unwrap_or(0.0),
                        b[1].as_f64().unwrap_or(0.0),
                        b[2].as_f64().unwrap_or(0.0),
                        b[3].as_f64().unwrap_or(0.0),
                    ],
                ))
            })
            .collect();
        let image_path = input.image_path.clone();
        let (embeddings_info, artifacts) = tokio::task::spawn_blocking(move || {
            let mut embeddings_info: Vec<serde_json::Value> = Vec::new();
            let mut artifacts: Vec<Artifact> = Vec::new();
            for (face_id, bbox) in parsed {
                match generate_embedding(&image_path, bbox) {
                    Ok((bytes, dim)) => {
                        embeddings_info.push(json!({
                            "face_id": face_id,
                            "dim": dim,
                            "element_type": "float32",
                        }));
                        artifacts.push(Artifact {
                            kind: "embedding",
                            bytes,
                            mime: "application/octet-stream",
                        });
                    }
                    Err(e) => {
                        eprintln!("[embed] face {} failed: {}", face_id, e);
                        embeddings_info.push(json!({
                            "face_id": face_id,
                            "error": e,
                        }));
                    }
                }
            }
            (embeddings_info, artifacts)
        })
        .await
        .map_err(|e| CapabilityError::Inference(format!("join error: {}", e)))?;

        let successful = embeddings_info
            .iter()
            .filter(|e| e.get("dim").is_some())
            .count();
        let confidence = if total == 0 {
            None
        } else {
            Some(successful as f32 / total as f32)
        };

        Ok(AnalyzeOutput {
            capability,
            provider_id: PROVIDER_ID.to_string(),
            schema_version: 1,
            result: json!({ "embeddings": embeddings_info }),
            confidence,
            artifacts,
        })
    }
}

/// Crop the face region from the image, save as a temp JPEG, then run
/// VNGenerateImageFeaturePrintRequest on the crop. Returns (raw_bytes, dim).
fn generate_embedding(image_path: &Path, bbox: [f64; 4]) -> Result<(Vec<u8>, usize), String> {
    let img = image::open(image_path)
        .map_err(|e| format!("open image: {}", e))?;
    let (img_w, img_h) = img.dimensions();

    // bbox is [x, y, w, h] normalized 0..1, upper-left origin
    let x = (bbox[0] * img_w as f64).round() as u32;
    let y = (bbox[1] * img_h as f64).round() as u32;
    let w = (bbox[2] * img_w as f64).round().max(1.0) as u32;
    let h = (bbox[3] * img_h as f64).round().max(1.0) as u32;

    // Clamp to image bounds
    let x = x.min(img_w.saturating_sub(1));
    let y = y.min(img_h.saturating_sub(1));
    let w = w.min(img_w - x);
    let h = h.min(img_h - y);

    let crop = img.crop_imm(x, y, w, h);

    // Write crop to a temp file for Vision
    let tmp = std::env::temp_dir().join(format!("gala_embed_{}.jpg", uuid::Uuid::new_v4()));
    crop.save(&tmp)
        .map_err(|e| format!("save crop: {}", e))?;

    let result = run_feature_print(&tmp);
    let _ = std::fs::remove_file(&tmp);
    result
}

fn run_feature_print(image_path: &Path) -> Result<(Vec<u8>, usize), String> {
    let path_str = image_path
        .to_str()
        .ok_or_else(|| "non-UTF8 path".to_string())?;

    unsafe {
        let url_str = NSString::from_str(path_str);
        let url: Retained<NSURL> = NSURL::fileURLWithPath(&url_str);
        let options = objc2_foundation::NSDictionary::new();
        let handler = VNImageRequestHandler::initWithURL_options(
            VNImageRequestHandler::alloc(),
            &url,
            &options,
        );

        let request = VNGenerateImageFeaturePrintRequest::init(
            VNGenerateImageFeaturePrintRequest::alloc(),
        );

        let request_base: &VNRequest = &request;
        let requests = NSArray::from_slice(&[request_base]);

        handler
            .performRequests_error(&requests)
            .map_err(|e| format!("performRequests: {:?}", e))?;

        let results = request
            .results()
            .ok_or_else(|| "no results from feature print".to_string())?;

        if results.len() == 0 {
            return Err("empty feature print results".to_string());
        }

        let obs = results.objectAtIndex(0);
        let data: Retained<NSData> = obs.data();
        let dim = obs.elementCount() as usize;

        let bytes = data.to_vec();

        Ok((bytes, dim))
    }
}
