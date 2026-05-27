use std::collections::HashMap;
use std::sync::Arc;

use super::provider::CapabilityProvider;
use super::types::{CapabilityId, ProviderId};

/// Holds registered capability providers and answers "who can do X?".
///
/// The control layer registers providers at startup; lookup is read-only
/// after that. The registry is intentionally simple — priority is `first
/// inserted wins` for now and will move to a config-driven priority table
/// (`assets/capability-priority.toml`) in a later iteration.
#[derive(Default)]
pub struct CapabilityRegistry {
    by_id: HashMap<ProviderId, Arc<dyn CapabilityProvider>>,
    by_capability: HashMap<CapabilityId, Vec<ProviderId>>,
}

impl CapabilityRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&mut self, provider: Arc<dyn CapabilityProvider>) {
        let id = provider.id();
        for capability in provider.capabilities() {
            let entries = self.by_capability.entry(*capability).or_default();
            if !entries.iter().any(|existing| existing == &id) {
                entries.push(id.clone());
            }
        }
        self.by_id.insert(id, provider);
    }

    pub fn get(&self, provider_id: &str) -> Option<Arc<dyn CapabilityProvider>> {
        self.by_id.get(provider_id).cloned()
    }

    pub fn providers_for(&self, capability: CapabilityId) -> Vec<ProviderId> {
        self.by_capability
            .get(capability)
            .cloned()
            .unwrap_or_default()
    }

    /// Returns the highest-priority provider that advertises `capability`.
    /// V0: first registered wins.
    pub fn select(&self, capability: CapabilityId) -> Option<Arc<dyn CapabilityProvider>> {
        self.by_capability
            .get(capability)
            .and_then(|ids| ids.first())
            .and_then(|id| self.by_id.get(id))
            .cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capability::provider::NoopProvider;

    const FACE_DETECT: &str = "face.detect";
    const FACE_EMBED: &str = "face.embed";

    #[test]
    fn register_and_select() {
        let mut reg = CapabilityRegistry::new();
        let p = Arc::new(NoopProvider::new("noop.v1", &[FACE_DETECT, FACE_EMBED]));
        reg.register(p.clone());

        assert_eq!(reg.providers_for(FACE_DETECT), vec!["noop.v1".to_string()]);
        assert_eq!(reg.providers_for(FACE_EMBED), vec!["noop.v1".to_string()]);
        assert!(reg.select(FACE_DETECT).is_some());
        assert!(reg.select("face.embed").is_some());
        assert!(reg.select("does.not.exist").is_none());
    }

    #[test]
    fn first_registered_wins_for_select() {
        let mut reg = CapabilityRegistry::new();
        let a = Arc::new(NoopProvider::new("first", &[FACE_DETECT]));
        let b = Arc::new(NoopProvider::new("second", &[FACE_DETECT]));
        reg.register(a);
        reg.register(b);

        let chosen = reg.select(FACE_DETECT).unwrap();
        assert_eq!(chosen.id(), "first");
        assert_eq!(reg.providers_for(FACE_DETECT).len(), 2);
    }
}
