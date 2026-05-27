use std::fmt;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

pub type CapabilityId = &'static str;
pub type ProviderId = String;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ScopeKind {
    Photo,
    Source,
    All,
}

impl ScopeKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            ScopeKind::Photo => "photo",
            ScopeKind::Source => "source",
            ScopeKind::All => "all",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Queued,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
    Partial,
}

impl JobStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            JobStatus::Queued => "queued",
            JobStatus::Running => "running",
            JobStatus::Paused => "paused",
            JobStatus::Completed => "completed",
            JobStatus::Failed => "failed",
            JobStatus::Cancelled => "cancelled",
            JobStatus::Partial => "partial",
        }
    }
}

/// A request submitted by the control layer (or a Tauri command) to run a
/// capability against a scope of photos.
#[derive(Debug, Clone)]
pub struct AnalysisRequest {
    pub capability: CapabilityId,
    /// Optional pin to a specific provider. When `None` the registry picks
    /// the highest-priority provider that advertises `capability`.
    pub provider_id: Option<ProviderId>,
    pub scope_kind: ScopeKind,
    /// Identifier matching `scope_kind` — photo_id for Photo, source_id for
    /// Source, ignored for All.
    pub scope_id: Option<String>,
    pub priority: i32,
    /// Provider-specific configuration forwarded as-is.
    pub config: serde_json::Value,
    /// Skip the (photo, capability, provider, schema_v) cache check.
    pub force: bool,
}

/// Per-job context passed into every `analyze` call.
pub struct AnalyzeContext {
    pub job_id: String,
    pub cancel: CancellationToken,
    pub config: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct AnalyzeInput {
    pub photo_id: String,
    pub image_path: PathBuf,
    pub thumbnail_path: Option<PathBuf>,
    pub hint_dimensions: Option<(u32, u32)>,
}

#[derive(Debug, Clone)]
pub struct AnalyzeOutput {
    pub capability: CapabilityId,
    pub provider_id: ProviderId,
    pub schema_version: u32,
    pub result: serde_json::Value,
    pub confidence: Option<f32>,
    pub artifacts: Vec<Artifact>,
}

#[derive(Debug, Clone)]
pub struct Artifact {
    pub kind: &'static str,
    pub bytes: Vec<u8>,
    pub mime: &'static str,
}

#[derive(Debug)]
pub enum CapabilityError {
    ProviderUnavailable(String),
    InvalidInput(String),
    Inference(String),
    Cancelled,
    Storage(String),
    Io(std::io::Error),
}

impl fmt::Display for CapabilityError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CapabilityError::ProviderUnavailable(s) => {
                write!(f, "provider unavailable: {}", s)
            }
            CapabilityError::InvalidInput(s) => write!(f, "invalid input: {}", s),
            CapabilityError::Inference(s) => write!(f, "inference error: {}", s),
            CapabilityError::Cancelled => write!(f, "cancelled"),
            CapabilityError::Storage(s) => write!(f, "storage error: {}", s),
            CapabilityError::Io(e) => write!(f, "io error: {}", e),
        }
    }
}

impl std::error::Error for CapabilityError {}

impl From<std::io::Error> for CapabilityError {
    fn from(value: std::io::Error) -> Self {
        CapabilityError::Io(value)
    }
}

impl From<rusqlite::Error> for CapabilityError {
    fn from(value: rusqlite::Error) -> Self {
        CapabilityError::Storage(value.to_string())
    }
}
