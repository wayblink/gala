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

pub mod commands;

pub use orchestrator::{Orchestrator, OrchestratorConfig, RunOutcome, RunSummary};
pub use provider::{CapabilityProvider, NoopProvider};
pub use registry::CapabilityRegistry;
pub use scope::resolve_scope;
pub use types::{
    AnalyzeContext, AnalyzeInput, AnalyzeOutput, AnalysisRequest, Artifact, CapabilityError,
    CapabilityId, JobStatus, ProviderId, ScopeKind,
};
