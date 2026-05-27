use async_trait::async_trait;
use std::sync::atomic::{AtomicU32, Ordering};

use super::types::{
    AnalyzeContext, AnalyzeInput, AnalyzeOutput, CapabilityError, CapabilityId, ProviderId,
};

/// Capability layer contract. Implementations may be pure Rust, spawn
/// subprocesses, or invoke remote services — the orchestrator does not
/// know which path is taken.
#[async_trait]
pub trait CapabilityProvider: Send + Sync {
    fn id(&self) -> ProviderId;
    fn capabilities(&self) -> &'static [CapabilityId];
    fn schema_version(&self, capability: CapabilityId) -> u32;

    async fn analyze(
        &self,
        ctx: &AnalyzeContext,
        capability: CapabilityId,
        input: &AnalyzeInput,
    ) -> Result<AnalyzeOutput, CapabilityError>;

    /// Optional batch entry. Default implementation falls back to per-photo
    /// `analyze`. Providers that can batch internally should override this.
    async fn analyze_batch(
        &self,
        ctx: &AnalyzeContext,
        capability: CapabilityId,
        inputs: &[AnalyzeInput],
    ) -> Result<Vec<Result<AnalyzeOutput, CapabilityError>>, CapabilityError> {
        let mut out = Vec::with_capacity(inputs.len());
        for input in inputs {
            out.push(self.analyze(ctx, capability, input).await);
        }
        Ok(out)
    }
}

/// Test / scaffolding provider that echoes its input as JSON.
/// Used by orchestrator tests and as the first registered provider while
/// real implementations land.
pub struct NoopProvider {
    id: ProviderId,
    caps: &'static [CapabilityId],
    counter: AtomicU32,
}

impl NoopProvider {
    pub fn new(id: impl Into<ProviderId>, capabilities: &'static [CapabilityId]) -> Self {
        Self {
            id: id.into(),
            caps: capabilities,
            counter: AtomicU32::new(0),
        }
    }

    pub fn calls(&self) -> u32 {
        self.counter.load(Ordering::SeqCst)
    }
}

#[async_trait]
impl CapabilityProvider for NoopProvider {
    fn id(&self) -> ProviderId {
        self.id.clone()
    }

    fn capabilities(&self) -> &'static [CapabilityId] {
        self.caps
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
        self.counter.fetch_add(1, Ordering::SeqCst);
        Ok(AnalyzeOutput {
            capability,
            provider_id: self.id.clone(),
            schema_version: 1,
            result: serde_json::json!({
                "echo": input.photo_id.clone(),
                "capability": capability,
            }),
            confidence: Some(1.0),
            artifacts: Vec::new(),
        })
    }
}
