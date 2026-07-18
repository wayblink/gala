//! macOS Vision content.classify provider — on-device image taxonomy labels.
//!
//! Uses `VNClassifyImageRequest` to produce coarse subject labels for Explore.
//! The provider only writes the analysis ledger; the library layer materializes
//! accepted labels into the unified label/tag projection.

use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};

use async_trait::async_trait;
use objc2::rc::Retained;
use objc2::AnyThread;
use objc2_foundation::{NSArray, NSString, NSURL};
use objc2_vision::{
    VNClassifyImageRequest, VNClassifyImageRequestRevision2, VNImageRequestHandler, VNRequest,
};
use serde_json::json;

use super::types::{
    AnalyzeContext, AnalyzeInput, AnalyzeOutput, CapabilityError, CapabilityId, ProviderId,
};
use super::CapabilityProvider;

pub const PROVIDER_ID: &str = "macos.vision.classify.v1";
pub const CONTENT_CLASSIFY: &str = "content.classify";

pub struct MacosVisionClassifyProvider {
    calls: AtomicU32,
}

impl MacosVisionClassifyProvider {
    pub fn new() -> Self {
        Self {
            calls: AtomicU32::new(0),
        }
    }

    #[allow(dead_code)]
    pub fn calls(&self) -> u32 {
        self.calls.load(Ordering::SeqCst)
    }
}

impl Default for MacosVisionClassifyProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl CapabilityProvider for MacosVisionClassifyProvider {
    fn id(&self) -> ProviderId {
        PROVIDER_ID.to_string()
    }

    fn capabilities(&self) -> &'static [CapabilityId] {
        &[CONTENT_CLASSIFY]
    }

    fn schema_version(&self, _capability: CapabilityId) -> u32 {
        1
    }

    async fn analyze(
        &self,
        ctx: &AnalyzeContext,
        capability: CapabilityId,
        input: &AnalyzeInput,
    ) -> Result<AnalyzeOutput, CapabilityError> {
        if capability != CONTENT_CLASSIFY {
            return Err(CapabilityError::InvalidInput(format!(
                "{} not supported by {}",
                capability, PROVIDER_ID
            )));
        }
        self.calls.fetch_add(1, Ordering::SeqCst);

        let path = input.image_path.clone();
        let max_labels = ctx
            .config
            .get("maxLabels")
            .and_then(|v| v.as_u64())
            .unwrap_or(8) as usize;
        let min_confidence = ctx
            .config
            .get("minConfidence")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.2) as f32;

        let labels = tokio::task::spawn_blocking(move || {
            classify_image_sync(&path, max_labels, min_confidence)
        })
        .await
        .map_err(|e| CapabilityError::Inference(format!("join error: {}", e)))?
        .map_err(CapabilityError::Inference)?;

        let confidence = labels
            .iter()
            .filter_map(|l| l.get("confidence").and_then(|c| c.as_f64()))
            .fold(0.0_f64, f64::max) as f32;

        Ok(AnalyzeOutput {
            capability,
            provider_id: PROVIDER_ID.to_string(),
            schema_version: 1,
            result: json!({
                "labels": labels,
                "taxonomy": "VNClassifyImageRequestRevision2",
            }),
            confidence: Some(confidence),
            artifacts: Vec::new(),
        })
    }
}

fn classify_image_sync(
    image_path: &Path,
    max_labels: usize,
    min_confidence: f32,
) -> Result<Vec<serde_json::Value>, String> {
    let path_str = image_path
        .to_str()
        .ok_or_else(|| format!("non-UTF8 path: {}", image_path.display()))?;

    unsafe {
        let url_str = NSString::from_str(path_str);
        let url: Retained<NSURL> = NSURL::fileURLWithPath(&url_str);
        let options = objc2_foundation::NSDictionary::new();
        let handler = VNImageRequestHandler::initWithURL_options(
            VNImageRequestHandler::alloc(),
            &url,
            &options,
        );

        let request = VNClassifyImageRequest::init(VNClassifyImageRequest::alloc());
        request.setRevision(VNClassifyImageRequestRevision2);

        let request_base: &VNRequest = &request;
        let requests = NSArray::from_slice(&[request_base]);
        handler
            .performRequests_error(&requests)
            .map_err(|err| format!("VNImageRequestHandler.performRequests: {:?}", err))?;

        let results = match request.results() {
            Some(r) => r,
            None => return Ok(Vec::new()),
        };

        let mut out = Vec::new();
        for i in 0..results.len() {
            let obs = results.objectAtIndex(i);
            let confidence = obs.confidence();
            if confidence < min_confidence {
                continue;
            }
            out.push(json!({
                "identifier": obs.identifier().to_string(),
                "confidence": confidence as f64,
            }));
            if out.len() >= max_labels {
                break;
            }
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn provider_advertises_content_classify() {
        let p = MacosVisionClassifyProvider::new();
        assert_eq!(p.id(), PROVIDER_ID);
        assert_eq!(p.capabilities(), &[CONTENT_CLASSIFY]);
        assert_eq!(p.schema_version(CONTENT_CLASSIFY), 1);
    }
}
