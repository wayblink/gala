use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU32, Ordering};

use super::provider::CapabilityProvider;
use super::types::{
    AnalyzeContext, AnalyzeInput, AnalyzeOutput, CapabilityError, CapabilityId, ProviderId,
};

pub const PHOTO_QUALITY: &str = "photo.quality";
const PROVIDER_ID: &str = "metadata.photo-quality.v1";
const PHOTO_FORMATS: &[&str] = &[
    "jpg", "jpeg", "heic", "heif", "dng", "raw", "arw", "cr2", "nef",
];
const CAPS: &[CapabilityId] = &[PHOTO_QUALITY];

pub struct MetadataPhotoQualityProvider {
    counter: AtomicU32,
}

impl MetadataPhotoQualityProvider {
    pub fn new() -> Self {
        Self {
            counter: AtomicU32::new(0),
        }
    }

    #[cfg(test)]
    pub fn calls(&self) -> u32 {
        self.counter.load(Ordering::SeqCst)
    }
}

impl Default for MetadataPhotoQualityProvider {
    fn default() -> Self {
        Self::new()
    }
}

fn bool_meta(meta: &Value, key: &str) -> bool {
    meta.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn i64_meta(meta: &Value, key: &str) -> Option<i64> {
    meta.get(key).and_then(Value::as_i64)
}

fn string_meta<'a>(meta: &'a Value, key: &str) -> Option<&'a str> {
    meta.get(key).and_then(Value::as_str)
}

fn extension_from(file_name: &str) -> Option<String> {
    file_name
        .rsplit_once('.')
        .map(|(_, ext)| ext.trim().to_ascii_lowercase())
        .filter(|ext| !ext.is_empty())
}

fn clamp_score(score: f64) -> i64 {
    score.round().clamp(0.0, 100.0) as i64
}

fn quality_label(score: i64) -> &'static str {
    if score >= 75 {
        "strong"
    } else if score >= 55 {
        "solid"
    } else {
        "weak"
    }
}

fn score_photo(input: &AnalyzeInput) -> Value {
    let mut reasons: Vec<&'static str> = Vec::new();
    let mut score = 42.0;
    let mut megapixels = None;
    let mut aspect_ratio = None;

    if let Some((width, height)) = input.hint_dimensions {
        let width = width as f64;
        let height = height as f64;
        let mp = (width * height) / 1_000_000.0;
        megapixels = Some(mp);
        let resolution_bonus = (mp.max(1.0).log2() * 10.0).min(26.0);
        score += resolution_bonus;
        if mp >= 10.0 {
            reasons.push("high resolution");
        } else if mp >= 3.0 {
            reasons.push("usable resolution");
        } else {
            reasons.push("low resolution");
        }

        let aspect = width.max(height) / width.min(height);
        aspect_ratio = Some(aspect);
        if aspect > 2.6 {
            score -= 8.0;
            reasons.push("extreme crop");
        } else if aspect < 1.9 {
            score += 4.0;
            reasons.push("balanced frame");
        }
    } else {
        score -= 8.0;
        reasons.push("missing dimensions");
    }

    let file_size = i64_meta(&input.meta, "file_size");
    let file_size_mb = file_size.map(|bytes| bytes as f64 / 1_000_000.0);
    if let Some(mb) = file_size_mb.filter(|mb| *mb > 0.0) {
        if mb >= 2.0 {
            score += (mb.log2() * 5.0).min(14.0);
            reasons.push("larger source file");
        } else if mb < 0.25 {
            score -= 10.0;
            reasons.push("small source file");
        }
    } else {
        score -= 5.0;
        reasons.push("missing file size");
    }

    let ext = string_meta(&input.meta, "extension")
        .map(str::to_ascii_lowercase)
        .or_else(|| string_meta(&input.meta, "file_name").and_then(extension_from));
    if ext
        .as_deref()
        .map(|value| PHOTO_FORMATS.contains(&value))
        .unwrap_or(false)
    {
        score += 5.0;
        reasons.push("photo format");
    }

    if bool_meta(&input.meta, "is_favorite") {
        score += 12.0;
        reasons.push("already favorited");
    }
    if bool_meta(&input.meta, "is_hidden") {
        score -= 24.0;
        reasons.push("already hidden");
    }

    let score = clamp_score(score);
    json!({
        "score": score,
        "label": quality_label(score),
        "reasons": reasons,
        "signals": {
            "megapixels": megapixels,
            "fileSizeMb": file_size_mb,
            "aspectRatio": aspect_ratio,
        }
    })
}

#[async_trait]
impl CapabilityProvider for MetadataPhotoQualityProvider {
    fn id(&self) -> ProviderId {
        PROVIDER_ID.to_string()
    }

    fn capabilities(&self) -> &'static [CapabilityId] {
        CAPS
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
        if capability != PHOTO_QUALITY {
            return Err(CapabilityError::InvalidInput(format!(
                "{} does not support {}",
                PROVIDER_ID, capability
            )));
        }
        self.counter.fetch_add(1, Ordering::SeqCst);
        Ok(AnalyzeOutput {
            capability,
            provider_id: self.id(),
            schema_version: 1,
            result: score_photo(input),
            confidence: Some(0.85),
            artifacts: Vec::new(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capability::types::AnalyzeContext;
    use std::path::PathBuf;
    use tokio_util::sync::CancellationToken;

    fn input(meta: Value, dimensions: Option<(u32, u32)>) -> AnalyzeInput {
        AnalyzeInput {
            photo_id: "p".into(),
            image_path: PathBuf::from("/photos/p.jpg"),
            thumbnail_path: None,
            hint_dimensions: dimensions,
            meta,
        }
    }

    #[tokio::test]
    async fn scores_strong_photo_from_metadata() {
        let provider = MetadataPhotoQualityProvider::new();
        let ctx = AnalyzeContext {
            job_id: "job".into(),
            cancel: CancellationToken::new(),
            config: Value::Null,
        };
        let output = provider
            .analyze(
                &ctx,
                PHOTO_QUALITY,
                &input(
                    json!({
                        "file_name": "best.heic",
                        "file_size": 4_000_000,
                        "is_favorite": true,
                        "is_hidden": false
                    }),
                    Some((4032, 3024)),
                ),
            )
            .await
            .unwrap();

        assert_eq!(output.result["label"], "strong");
        assert!(output.result["score"].as_i64().unwrap() >= 75);
        assert_eq!(provider.calls(), 1);
    }

    #[tokio::test]
    async fn penalizes_missing_metadata_and_hidden_photos() {
        let provider = MetadataPhotoQualityProvider::new();
        let ctx = AnalyzeContext {
            job_id: "job".into(),
            cancel: CancellationToken::new(),
            config: Value::Null,
        };
        let output = provider
            .analyze(
                &ctx,
                PHOTO_QUALITY,
                &input(
                    json!({
                        "file_name": "tiny.gif",
                        "file_size": 100_000,
                        "is_hidden": true
                    }),
                    None,
                ),
            )
            .await
            .unwrap();

        assert_eq!(output.result["label"], "weak");
        assert!(output.result["score"].as_i64().unwrap() < 55);
    }
}
