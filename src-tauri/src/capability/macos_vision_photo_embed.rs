//! macOS Vision photo.embed provider — full-image semantic feature print.
//!
//! Reuses the run_feature_print primitive from macos_vision_embed.rs but
//! feeds the original image path (no crop) so the resulting embedding
//! captures the photo's overall scene/composition. Used by Similar Review
//! to spot near-duplicates and same-scene photos that aren't faces.

use std::sync::atomic::{AtomicU32, Ordering};

use async_trait::async_trait;
use serde_json::json;

use super::macos_vision_embed::run_feature_print;
use super::types::{
    AnalyzeContext, AnalyzeInput, AnalyzeOutput, Artifact, CapabilityError, CapabilityId,
    ProviderId,
};
use super::CapabilityProvider;

pub const PROVIDER_ID: &str = "macos.vision.photo-embed.v1";
pub const PHOTO_EMBED: &str = "photo.embed";

pub struct MacosVisionPhotoEmbedProvider {
    calls: AtomicU32,
}

impl MacosVisionPhotoEmbedProvider {
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

impl Default for MacosVisionPhotoEmbedProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl CapabilityProvider for MacosVisionPhotoEmbedProvider {
    fn id(&self) -> ProviderId {
        PROVIDER_ID.to_string()
    }

    fn capabilities(&self) -> &'static [CapabilityId] {
        &[PHOTO_EMBED]
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
        if capability != PHOTO_EMBED {
            return Err(CapabilityError::InvalidInput(format!(
                "{} not supported by {}",
                capability, PROVIDER_ID
            )));
        }
        self.calls.fetch_add(1, Ordering::SeqCst);

        // Vision's performRequests is sync; ship it to the blocking pool so a
        // 10k-photo embedding pass doesn't starve tokio workers.
        let path = input.image_path.clone();
        let (bytes, dim) = tokio::task::spawn_blocking(move || run_feature_print(&path))
            .await
            .map_err(|e| CapabilityError::Inference(format!("join error: {}", e)))?
            .map_err(CapabilityError::Inference)?;

        Ok(AnalyzeOutput {
            capability,
            provider_id: PROVIDER_ID.to_string(),
            schema_version: 1,
            result: json!({
                "dim": dim,
                "element_type": "float32",
            }),
            confidence: Some(1.0),
            artifacts: vec![Artifact {
                kind: "embedding",
                bytes,
                mime: "application/octet-stream",
            }],
        })
    }
}
