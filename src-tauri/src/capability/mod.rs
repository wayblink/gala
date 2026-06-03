//! Capability layer — see docs/capability-interface-rfc.md
//!
//! The control layer calls the capability layer through the [`CapabilityProvider`] trait.
//! Provider implementations are free to be pure Rust (macOS Vision, ONNX), spawn
//! subprocesses (Python torch), or hit a remote service. The orchestrator owns
//! job persistence and dispatch; providers only produce results.

mod orchestrator;
mod provider;
mod registry;
mod scope;
mod store;
mod types;

mod clusterer;
mod materializer;

#[cfg(target_os = "macos")]
mod macos_vision;

#[cfg(target_os = "macos")]
mod macos_vision_embed;

#[cfg(target_os = "macos")]
mod macos_vision_photo_embed;

#[cfg(target_os = "macos")]
mod macos_vision_classify;

pub mod commands;

pub use materializer::materialize_face_detect;
pub use clusterer::{cluster_faces, ClusterSummary};
pub use orchestrator::{Orchestrator, OrchestratorConfig, RunOutcome, RunSummary};
pub use provider::{CapabilityProvider, NoopProvider};
pub use registry::CapabilityRegistry;
pub use scope::resolve_scope;
pub use types::{
    AnalysisRequest, AnalyzeContext, AnalyzeInput, AnalyzeOutput, Artifact, CapabilityError,
    CapabilityId, JobStatus, ProviderId, ScopeKind,
};

#[cfg(target_os = "macos")]
pub use macos_vision::MacosVisionFaceProvider;

#[cfg(target_os = "macos")]
pub use macos_vision_embed::MacosVisionEmbedProvider;

#[cfg(target_os = "macos")]
pub use macos_vision_photo_embed::MacosVisionPhotoEmbedProvider;

#[cfg(target_os = "macos")]
pub use macos_vision_classify::MacosVisionClassifyProvider;
