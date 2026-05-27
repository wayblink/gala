//! Job orchestrator with a bounded tokio concurrency pool.
//!
//! Responsibilities:
//! * Validate the request, select a provider via the registry.
//! * Idempotency: skip photos whose (photo, capability, provider, schema_v)
//!   row already exists in `analysis_results` unless `force=true`.
//! * Persist job + events + results in `analysis_jobs` / `analysis_events`
//!   / `analysis_results` while the job runs.
//! * Honour cancellation via `CancellationToken`.
//!
//! V0 keeps it simple: one `run` call drains the supplied inputs serially
//! through a `Semaphore` of size `max_concurrency`. No cross-job scheduler
//! yet — Tauri commands will spawn one orchestrator call per request and
//! await it via `JoinHandle`. Cross-job priority queueing is M3.

use std::path::PathBuf;
use std::sync::Arc;

use rusqlite::Connection;
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;

use super::provider::CapabilityProvider;
use super::registry::CapabilityRegistry;
use super::store;
use super::types::{
    AnalyzeContext, AnalyzeInput, AnalyzeOutput, AnalysisRequest, CapabilityError, JobStatus,
};

/// Tuning knobs the caller may pass through.
#[derive(Clone, Debug)]
pub struct OrchestratorConfig {
    pub max_concurrency: usize,
}

impl Default for OrchestratorConfig {
    fn default() -> Self {
        Self {
            max_concurrency: 4,
        }
    }
}

/// Outcome reported when a job completes.
#[derive(Debug, Clone)]
pub struct RunSummary {
    pub job_id: String,
    pub outcome: RunOutcome,
    pub photos_done: i64,
    pub photos_failed: i64,
    pub photos_skipped: i64,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunOutcome {
    Completed,
    Partial,
    Failed,
    Cancelled,
}

pub struct Orchestrator {
    db_path: PathBuf,
    registry: Arc<CapabilityRegistry>,
    config: OrchestratorConfig,
}

impl Orchestrator {
    pub fn new(
        db_path: PathBuf,
        registry: Arc<CapabilityRegistry>,
        config: OrchestratorConfig,
    ) -> Self {
        Self {
            db_path,
            registry,
            config,
        }
    }

    fn open_conn(&self) -> Result<Connection, CapabilityError> {
        Connection::open(&self.db_path)
            .map_err(|e| CapabilityError::Storage(format!("open db: {}", e)))
    }

    /// Run a job to completion. `inputs` is the resolved photo set for the
    /// job's scope — resolving the scope (Photo / Source / All → photo_ids
    /// + paths) is the caller's responsibility because the photos table
    /// lives in `library::storage`.
    pub async fn run(
        &self,
        request: AnalysisRequest,
        inputs: Vec<AnalyzeInput>,
        cancel: CancellationToken,
    ) -> Result<RunSummary, CapabilityError> {
        let provider = self.resolve_provider(&request)?;
        let provider_id = provider.id();
        let schema_version = provider.schema_version(request.capability);

        let job = {
            let conn = self.open_conn()?;
            store::insert_job(&conn, &request, &provider_id, schema_version)?
        };

        {
            let conn = self.open_conn()?;
            store::mark_running(&conn, &job.id, inputs.len() as i64)?;
            store::append_event(
                &conn,
                &job.id,
                None,
                "started",
                Some(&format!(
                    "capability={} provider={} schema_v={} photos={}",
                    request.capability,
                    provider_id,
                    schema_version,
                    inputs.len()
                )),
                None,
            )?;
        }

        let semaphore = Arc::new(Semaphore::new(self.config.max_concurrency.max(1)));
        let ctx = AnalyzeContext {
            job_id: job.id.clone(),
            cancel: cancel.clone(),
            config: request.config.clone(),
        };

        let mut done: i64 = 0;
        let mut failed: i64 = 0;
        let mut skipped: i64 = 0;
        let mut outcome = RunOutcome::Completed;

        // Pre-filter inputs by the idempotency cache (unless force).
        let mut pending: Vec<AnalyzeInput> = Vec::with_capacity(inputs.len());
        for input in inputs.into_iter() {
            if cancel.is_cancelled() {
                outcome = RunOutcome::Cancelled;
                break;
            }
            if !request.force {
                let conn = self.open_conn()?;
                if store::result_exists(
                    &conn,
                    &input.photo_id,
                    request.capability,
                    &provider_id,
                    schema_version,
                )? {
                    skipped += 1;
                    store::append_event(
                        &conn,
                        &job.id,
                        Some(&input.photo_id),
                        "skipped",
                        Some("cache hit"),
                        None,
                    )?;
                    continue;
                }
            }
            pending.push(input);
        }

        if outcome != RunOutcome::Cancelled {
            // Drain remaining inputs with bounded concurrency.
            let mut handles = Vec::with_capacity(pending.len());
            for input in pending.into_iter() {
                if cancel.is_cancelled() {
                    outcome = RunOutcome::Cancelled;
                    break;
                }
                let permit = semaphore
                    .clone()
                    .acquire_owned()
                    .await
                    .map_err(|e| CapabilityError::Storage(format!("semaphore: {}", e)))?;
                let provider = provider.clone();
                let capability = request.capability;
                let ctx = AnalyzeContext {
                    job_id: ctx.job_id.clone(),
                    cancel: ctx.cancel.clone(),
                    config: ctx.config.clone(),
                };
                let handle = tokio::spawn(async move {
                    let _permit = permit; // hold until task completes
                    let result = provider.analyze(&ctx, capability, &input).await;
                    (input, result)
                });
                handles.push(handle);
            }

            for handle in handles {
                let (input, result) = match handle.await {
                    Ok(pair) => pair,
                    Err(join_err) => {
                        failed += 1;
                        let conn = self.open_conn()?;
                        store::append_event(
                            &conn,
                            &job.id,
                            None,
                            "failed",
                            Some(&format!("join error: {}", join_err)),
                            None,
                        )?;
                        continue;
                    }
                };

                match result {
                    Ok(output) => {
                        done += 1;
                        write_success(&self.db_path, &job.id, &input.photo_id, &output)?;
                    }
                    Err(CapabilityError::Cancelled) => {
                        outcome = RunOutcome::Cancelled;
                        let conn = self.open_conn()?;
                        store::append_event(
                            &conn,
                            &job.id,
                            Some(&input.photo_id),
                            "cancelled",
                            None,
                            None,
                        )?;
                    }
                    Err(err) => {
                        failed += 1;
                        let conn = self.open_conn()?;
                        store::append_event(
                            &conn,
                            &job.id,
                            Some(&input.photo_id),
                            "failed",
                            Some(&err.to_string()),
                            None,
                        )?;
                    }
                }
            }
        }

        // Decide final status.
        let final_status = if outcome == RunOutcome::Cancelled {
            JobStatus::Cancelled
        } else if failed == 0 {
            JobStatus::Completed
        } else if done > 0 {
            JobStatus::Partial
        } else {
            JobStatus::Failed
        };
        let summary_outcome = match final_status {
            JobStatus::Completed => RunOutcome::Completed,
            JobStatus::Partial => RunOutcome::Partial,
            JobStatus::Failed => RunOutcome::Failed,
            JobStatus::Cancelled => RunOutcome::Cancelled,
            _ => RunOutcome::Failed,
        };

        let error_message = if final_status == JobStatus::Failed {
            Some(format!("{} photo(s) failed", failed))
        } else {
            None
        };

        {
            let conn = self.open_conn()?;
            store::mark_done_counts(&conn, &job.id, done, failed, skipped)?;
            store::finalize_job(&conn, &job.id, final_status, error_message.as_deref())?;
        }

        Ok(RunSummary {
            job_id: job.id,
            outcome: summary_outcome,
            photos_done: done,
            photos_failed: failed,
            photos_skipped: skipped,
            error_message,
        })
    }

    fn resolve_provider(
        &self,
        request: &AnalysisRequest,
    ) -> Result<Arc<dyn CapabilityProvider>, CapabilityError> {
        if let Some(pin) = request.provider_id.as_deref() {
            return self
                .registry
                .get(pin)
                .ok_or_else(|| CapabilityError::ProviderUnavailable(pin.to_string()));
        }
        self.registry.select(request.capability).ok_or_else(|| {
            CapabilityError::ProviderUnavailable(format!(
                "no provider registered for capability {}",
                request.capability
            ))
        })
    }
}

fn write_success(
    db_path: &PathBuf,
    job_id: &str,
    photo_id: &str,
    out: &AnalyzeOutput,
) -> Result<(), CapabilityError> {
    let conn = Connection::open(db_path)
        .map_err(|e| CapabilityError::Storage(format!("open db: {}", e)))?;
    store::upsert_result(&conn, photo_id, job_id, out)?;
    let summary = serde_json::to_string(&out.result).ok();
    store::append_event(&conn, job_id, Some(photo_id), "result", None, summary.as_deref())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capability::provider::NoopProvider;
    use crate::library::storage::{initialize_schema, open_database};
    use rusqlite::params;
    use std::path::PathBuf;
    use tempfile::TempDir;

    const FACE_DETECT: &str = "face.detect";

    fn setup_db_with_photos(photo_count: usize) -> (TempDir, PathBuf) {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("test.db");
        let conn = open_database(&path).expect("open db");
        initialize_schema(&conn).expect("init schema");

        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO sources (id, name, root_path, source_type, status, created_at, updated_at) \
             VALUES ('src-1', 'Test', '/tmp/src', 'local', 'online', ?1, ?1)",
            params![now],
        )
        .expect("insert source");

        for i in 0..photo_count {
            let pid = format!("photo-{}", i);
            conn.execute(
                "INSERT INTO photos (id, source_id, relative_path, absolute_path_snapshot, file_name, \
                 extension, file_size, file_mtime, status, created_at, updated_at) \
                 VALUES (?1, 'src-1', ?2, ?3, ?4, 'jpg', 1024, 0, 'indexed', ?5, ?5)",
                params![pid, format!("{}.jpg", i), format!("/tmp/src/{}.jpg", i), format!("{}.jpg", i), now],
            )
            .expect("insert photo");
        }

        (dir, path)
    }

    fn make_inputs(n: usize) -> Vec<AnalyzeInput> {
        (0..n)
            .map(|i| AnalyzeInput {
                photo_id: format!("photo-{}", i),
                image_path: PathBuf::from(format!("/tmp/src/{}.jpg", i)),
                thumbnail_path: None,
                hint_dimensions: None,
            })
            .collect()
    }

    fn build_orchestrator(path: PathBuf) -> (Orchestrator, Arc<NoopProvider>) {
        let provider = Arc::new(NoopProvider::new("noop.v1", &[FACE_DETECT]));
        let mut registry = CapabilityRegistry::new();
        registry.register(provider.clone());
        let orch = Orchestrator::new(
            path,
            Arc::new(registry),
            OrchestratorConfig { max_concurrency: 2 },
        );
        (orch, provider)
    }

    fn make_request() -> AnalysisRequest {
        AnalysisRequest {
            capability: FACE_DETECT,
            provider_id: None,
            scope_kind: crate::capability::types::ScopeKind::All,
            scope_id: None,
            priority: 0,
            config: serde_json::json!({}),
            force: false,
        }
    }

    #[tokio::test]
    async fn noop_provider_runs_end_to_end() {
        let (_dir, path) = setup_db_with_photos(3);
        let (orch, provider) = build_orchestrator(path.clone());

        let summary = orch
            .run(make_request(), make_inputs(3), CancellationToken::new())
            .await
            .expect("run ok");

        assert_eq!(summary.outcome, RunOutcome::Completed);
        assert_eq!(summary.photos_done, 3);
        assert_eq!(summary.photos_failed, 0);
        assert_eq!(summary.photos_skipped, 0);
        assert_eq!(provider.calls(), 3);

        let conn = Connection::open(&path).unwrap();
        let job = store::fetch_job(&conn, &summary.job_id).unwrap().unwrap();
        assert_eq!(job.status, "completed");
        assert_eq!(job.photos_total, 3);
        assert_eq!(job.photos_done, 3);
        assert!(job.started_at.is_some());
        assert!(job.completed_at.is_some());

        // 1 "started" + 3 "result" events expected
        assert_eq!(store::count_events(&conn, &summary.job_id).unwrap(), 4);
        assert_eq!(store::count_results(&conn, &summary.job_id).unwrap(), 3);
    }

    #[tokio::test]
    async fn second_run_skips_cached_photos() {
        let (_dir, path) = setup_db_with_photos(2);
        let (orch, provider) = build_orchestrator(path.clone());

        let _ = orch
            .run(make_request(), make_inputs(2), CancellationToken::new())
            .await
            .expect("first run");
        let second = orch
            .run(make_request(), make_inputs(2), CancellationToken::new())
            .await
            .expect("second run");

        assert_eq!(second.photos_done, 0);
        assert_eq!(second.photos_skipped, 2);
        assert_eq!(provider.calls(), 2, "provider should not be invoked again");
    }

    #[tokio::test]
    async fn force_flag_bypasses_cache() {
        let (_dir, path) = setup_db_with_photos(1);
        let (orch, provider) = build_orchestrator(path.clone());

        let _ = orch
            .run(make_request(), make_inputs(1), CancellationToken::new())
            .await
            .expect("first run");

        let mut req = make_request();
        req.force = true;
        let summary = orch
            .run(req, make_inputs(1), CancellationToken::new())
            .await
            .expect("forced run");

        assert_eq!(summary.photos_done, 1);
        assert_eq!(summary.photos_skipped, 0);
        assert_eq!(provider.calls(), 2);
    }

    #[tokio::test]
    async fn unknown_capability_returns_provider_unavailable() {
        let (_dir, path) = setup_db_with_photos(1);
        let (orch, _) = build_orchestrator(path);

        let mut req = make_request();
        req.capability = "does.not.exist";
        let err = orch
            .run(req, make_inputs(1), CancellationToken::new())
            .await
            .expect_err("should fail");

        match err {
            CapabilityError::ProviderUnavailable(_) => {}
            other => panic!("expected ProviderUnavailable, got {:?}", other),
        }
    }
}
