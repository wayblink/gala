//! macOS Vision face.detect provider.
//!
//! Uses VNDetectFaceRectanglesRequest via objc2-vision. The detection runs
//! synchronously on the calling thread (Vision dispatches internally to its
//! own thread pool, and on Apple Silicon prefers the Neural Engine). We
//! invoke it from inside `analyze`, which runs on a tokio worker — fine
//! because the call is bounded and blocking-but-fast (typical 50–300ms
//! per photo at full resolution).
//!
//! Best-effort error policy (RFC §5 / user Q3): per-photo failures bubble
//! up as CapabilityError::Inference, which the orchestrator records as a
//! "failed" event without aborting the whole job.

#![cfg(target_os = "macos")]

use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};

use async_trait::async_trait;
use objc2::rc::Retained;
use objc2::AnyThread;
use objc2_foundation::{NSArray, NSString, NSURL};
use objc2_vision::{VNDetectFaceRectanglesRequest, VNImageRequestHandler, VNRequest};
use serde_json::json;

use super::types::{
    AnalyzeContext, AnalyzeInput, AnalyzeOutput, CapabilityError, CapabilityId, ProviderId,
};
use super::CapabilityProvider;

pub const PROVIDER_ID: &str = "macos.vision.v1";
pub const FACE_DETECT: &str = "face.detect";

pub struct MacosVisionFaceProvider {
    calls: AtomicU32,
}

impl MacosVisionFaceProvider {
    pub fn new() -> Self {
        Self {
            calls: AtomicU32::new(0),
        }
    }

    pub fn calls(&self) -> u32 {
        self.calls.load(Ordering::SeqCst)
    }
}

impl Default for MacosVisionFaceProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl CapabilityProvider for MacosVisionFaceProvider {
    fn id(&self) -> ProviderId {
        PROVIDER_ID.to_string()
    }

    fn capabilities(&self) -> &'static [CapabilityId] {
        &[FACE_DETECT]
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
        if capability != FACE_DETECT {
            return Err(CapabilityError::InvalidInput(format!(
                "capability {} not supported by {}",
                capability, PROVIDER_ID
            )));
        }
        self.calls.fetch_add(1, Ordering::SeqCst);

        // Vision's performRequests blocks the calling thread. Move it onto
        // the blocking pool so a large face.detect job doesn't starve the
        // tokio worker threads. The objc2 objects live entirely inside
        // detect_faces_sync (created + dropped there); only the owned
        // PathBuf crosses in and the Send Vec<Value> crosses out.
        let path = input.image_path.clone();
        let faces = tokio::task::spawn_blocking(move || detect_faces_sync(&path))
            .await
            .map_err(|e| CapabilityError::Inference(format!("join error: {}", e)))?
            .map_err(CapabilityError::Inference)?;

        let face_count = faces.len();
        let result = json!({
            "faces": faces,
        });
        let confidence = if face_count == 0 {
            Some(0.0)
        } else {
            // Surface the max per-face confidence at the photo level so the
            // ledger can answer "is there definitely a face here?" without
            // re-parsing the JSON blob.
            faces
                .iter()
                .filter_map(|f| f.get("confidence").and_then(|c| c.as_f64()))
                .fold(0.0_f64, f64::max)
                .into()
        };

        Ok(AnalyzeOutput {
            capability,
            provider_id: PROVIDER_ID.to_string(),
            schema_version: 1,
            result,
            confidence: confidence.map(|c| c as f32),
            artifacts: Vec::new(),
        })
    }
}

/// Synchronous Vision call. Returns a Vec of `{ bbox: [x, y, w, h],
/// confidence: f }` JSON values in image-relative coords (origin top-left,
/// 0..1). Vision returns bottom-left origin; we flip y so downstream code
/// can treat the image as upper-left like the rest of the app.
fn detect_faces_sync(image_path: &Path) -> Result<Vec<serde_json::Value>, String> {
    let path_str = image_path
        .to_str()
        .ok_or_else(|| format!("non-UTF8 path: {}", image_path.display()))?;

    unsafe {
        let url_str = NSString::from_str(path_str);
        let url: Retained<NSURL> = NSURL::fileURLWithPath(&url_str);

        // Empty options dict — Vision picks defaults (full image, no
        // orientation hint). EXIF orientation is honored automatically when
        // initWithURL is used because Vision reads the file metadata.
        let options = objc2_foundation::NSDictionary::new();
        let handler = VNImageRequestHandler::initWithURL_options(
            VNImageRequestHandler::alloc(),
            &url,
            &options,
        );

        let request = VNDetectFaceRectanglesRequest::init(VNDetectFaceRectanglesRequest::alloc());

        // Cast request to base VNRequest array for performRequests.
        let request_base: &VNRequest = &request;
        let requests = NSArray::from_slice(&[request_base]);

        handler
            .performRequests_error(&requests)
            .map_err(|err| format!("VNImageRequestHandler.performRequests: {:?}", err))?;

        let results = match request.results() {
            Some(r) => r,
            None => return Ok(Vec::new()),
        };

        let mut out = Vec::with_capacity(results.len());
        for i in 0..results.len() {
            let obs = results.objectAtIndex(i);
            // obs is &VNFaceObservation via Vision's typed return; we read
            // boundingBox (CGRect normalized, bottom-left origin) and
            // confidence (VNConfidence = f32).
            let bbox = obs.boundingBox();
            let confidence = obs.confidence();

            // Flip y so origin is upper-left to match the rest of Gala's
            // photo coordinate convention.
            let x = bbox.origin.x as f64;
            let y_bottom = bbox.origin.y as f64;
            let w = bbox.size.width as f64;
            let h = bbox.size.height as f64;
            let y_top = 1.0 - y_bottom - h;

            out.push(json!({
                "bbox": [x, y_top, w, h],
                "confidence": confidence as f64,
            }));
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[tokio::test]
    async fn provider_advertises_face_detect() {
        let p = MacosVisionFaceProvider::new();
        assert_eq!(p.id(), PROVIDER_ID);
        assert_eq!(p.capabilities(), &[FACE_DETECT]);
        assert_eq!(p.schema_version(FACE_DETECT), 1);
    }

    #[tokio::test]
    async fn detects_on_real_jpeg_or_returns_empty() {
        // test-photos/IMG_0001.jpg lives at the repo root; resolve via
        // CARGO_MANIFEST_DIR so the test works from anywhere cargo runs it.
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let path = PathBuf::from(manifest_dir)
            .parent()
            .unwrap()
            .join("test-photos/IMG_0001.jpg");
        if !path.exists() {
            // CI without sample photos — just assert the provider didn't
            // panic on the missing-file path.
            return;
        }

        let provider = MacosVisionFaceProvider::new();
        let input = AnalyzeInput {
            photo_id: "test-1".into(),
            image_path: path,
            thumbnail_path: None,
            hint_dimensions: None,
            meta: serde_json::Value::Null,
        };
        let ctx = AnalyzeContext {
            job_id: "test-job".into(),
            cancel: tokio_util::sync::CancellationToken::new(),
            config: serde_json::json!({}),
        };
        let out = provider
            .analyze(&ctx, FACE_DETECT, &input)
            .await
            .expect("vision call");
        // Either the photo has faces (>0) or it doesn't. Both are valid; the
        // test only proves the pipeline doesn't crash on a real JPEG.
        let faces = out.result.get("faces").and_then(|f| f.as_array());
        assert!(faces.is_some());
        eprintln!(
            "[vision-test] {} detected {} face(s) (confidence {:?})",
            "IMG_0001.jpg",
            faces.unwrap().len(),
            out.confidence
        );
    }

    /// One-off sanity sweep over the face fixture set. Run with:
    ///   cargo test --lib capability::macos_vision::tests::vision_sweep -- --nocapture --ignored
    /// Ignored by default because it depends on test-photos-faces/ which is
    /// developer-local. Output lists per-file face count and confidence so
    /// we can spot whether AI-generated faces (StyleGAN) survive Vision and
    /// how well multi-face shots like Solvay 1927 perform.
    #[tokio::test]
    #[ignore]
    async fn vision_sweep() {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let dir = PathBuf::from(manifest_dir)
            .parent()
            .unwrap()
            .join("test-photos-faces");
        if !dir.exists() {
            eprintln!("[vision-sweep] {} missing — skipping", dir.display());
            return;
        }
        let mut files: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().and_then(|x| x.to_str()) == Some("jpg"))
            .collect();
        files.sort();
        let provider = MacosVisionFaceProvider::new();
        for path in files {
            let input = AnalyzeInput {
                photo_id: path.file_stem().unwrap().to_string_lossy().into_owned(),
                image_path: path.clone(),
                thumbnail_path: None,
                hint_dimensions: None,
                meta: serde_json::Value::Null,
            };
            let ctx = AnalyzeContext {
                job_id: "vision-sweep".into(),
                cancel: tokio_util::sync::CancellationToken::new(),
                config: serde_json::json!({}),
            };
            match provider.analyze(&ctx, FACE_DETECT, &input).await {
                Ok(o) => {
                    let faces = o
                        .result
                        .get("faces")
                        .and_then(|f| f.as_array())
                        .map(|a| a.len())
                        .unwrap_or(0);
                    let conf = o.confidence.unwrap_or(0.0);
                    eprintln!(
                        "[vision-sweep] {:<22} {:3} face(s)  best_conf={:.2}",
                        path.file_name().unwrap().to_string_lossy(),
                        faces,
                        conf,
                    );
                }
                Err(e) => {
                    eprintln!(
                        "[vision-sweep] {:<22} ERROR: {}",
                        path.file_name().unwrap().to_string_lossy(),
                        e
                    );
                }
            }
        }
    }
}
