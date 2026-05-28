//! Tauri command surface for the capability layer.
//!
//! Commands are thin adapters: they marshal serde-friendly DTOs to/from
//! the internal capability types and never expose `dyn` traits or raw
//! tokio types across the FFI boundary.

use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

use chrono::{DateTime, Utc};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

use crate::library::storage::{initialize_schema, migrate_schema, open_database};

use super::orchestrator::{Orchestrator, OrchestratorConfig};
use super::provider::NoopProvider;
use super::registry::CapabilityRegistry;
use super::resolve_scope;
use super::types::{AnalysisRequest, ScopeKind};

const FACE_DETECT: &str = "face.detect";
const FACE_EMBED: &str = "face.embed";
const FACE_CLUSTER: &str = "face.cluster";

static REGISTRY: OnceLock<Arc<CapabilityRegistry>> = OnceLock::new();

fn registry() -> Arc<CapabilityRegistry> {
    REGISTRY
        .get_or_init(|| {
            let mut reg = CapabilityRegistry::new();
            // M1.3a: only NoopProvider, advertising the three face capabilities
            // so we can exercise the full request → result → UI pipeline before
            // the macOS Vision provider lands in M1.3b.
            let noop = Arc::new(NoopProvider::new(
                "noop.v1",
                &[FACE_DETECT, FACE_EMBED, FACE_CLUSTER],
            ));
            reg.register(noop);
            Arc::new(reg)
        })
        .clone()
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    Ok(data_dir.join("library.db"))
}

fn ensure_db(app: &AppHandle) -> Result<PathBuf, String> {
    let path = db_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create data dir: {}", e))?;
    }
    // Bootstrap the DB lazily so capability commands don't require the user
    // to have scanned a source first. Empty-library is a valid state — the
    // orchestrator will simply produce a 0/0/0 RunSummary.
    let conn = open_database(&path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    Ok(path)
}

#[derive(Debug, Deserialize)]
pub struct AnalysisRequestDto {
    pub capability: String,
    #[serde(default)]
    pub provider_id: Option<String>,
    pub scope_kind: ScopeKind,
    #[serde(default)]
    pub scope_id: Option<String>,
    #[serde(default)]
    pub priority: i32,
    #[serde(default)]
    pub config: Option<serde_json::Value>,
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Serialize)]
pub struct RunSummaryDto {
    pub job_id: String,
    pub outcome: String,
    pub photos_done: i64,
    pub photos_failed: i64,
    pub photos_skipped: i64,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CapabilityDescriptorDto {
    pub provider_id: String,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct AnalysisJobDto {
    pub id: String,
    pub capability: String,
    pub provider_id: String,
    pub schema_version: i32,
    pub scope_kind: String,
    pub scope_id: Option<String>,
    pub status: String,
    pub priority: i32,
    pub photos_total: i64,
    pub photos_done: i64,
    pub photos_failed: i64,
    pub photos_skipped: i64,
    pub created_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AnalysisResultDto {
    pub photo_id: String,
    pub capability: String,
    pub provider_id: String,
    pub schema_version: i32,
    pub result: serde_json::Value,
    pub confidence: Option<f64>,
    pub generated_at: String,
}

fn map_capability(name: &str) -> Result<&'static str, String> {
    match name {
        "face.detect" => Ok(FACE_DETECT),
        "face.embed" => Ok(FACE_EMBED),
        "face.cluster" => Ok(FACE_CLUSTER),
        other => Err(format!("unknown capability: {}", other)),
    }
}

#[tauri::command]
pub async fn analysis_request_cmd(
    app: AppHandle,
    request: AnalysisRequestDto,
) -> Result<RunSummaryDto, String> {
    let path = ensure_db(&app)?;
    let capability = map_capability(&request.capability)?;
    let internal = AnalysisRequest {
        capability,
        provider_id: request.provider_id,
        scope_kind: request.scope_kind,
        scope_id: request.scope_id.clone(),
        priority: request.priority,
        config: request.config.unwrap_or_else(|| serde_json::json!({})),
        force: request.force,
    };

    // Resolve scope synchronously on the calling task — keep the DB read
    // off the orchestrator's hot path so it can stay path-agnostic.
    let inputs = {
        let conn = open_database(&path)?;
        resolve_scope(&conn, internal.scope_kind, internal.scope_id.as_deref())
            .map_err(|e| e.to_string())?
    };

    let orchestrator =
        Orchestrator::new(path, registry(), OrchestratorConfig { max_concurrency: 4 });
    let summary = orchestrator
        .run(internal, inputs, CancellationToken::new())
        .await
        .map_err(|e| e.to_string())?;

    Ok(RunSummaryDto {
        job_id: summary.job_id,
        outcome: format!("{:?}", summary.outcome).to_lowercase(),
        photos_done: summary.photos_done,
        photos_failed: summary.photos_failed,
        photos_skipped: summary.photos_skipped,
        error_message: summary.error_message,
    })
}

#[tauri::command]
pub fn analysis_job_cmd(app: AppHandle, id: String) -> Result<Option<AnalysisJobDto>, String> {
    let path = ensure_db(&app)?;
    let conn = open_database(&path)?;
    let row: rusqlite::Result<AnalysisJobDto> = conn.query_row(
        "SELECT id, capability, provider_id, schema_version, scope_kind, scope_id, status, priority, \
                photos_total, photos_done, photos_failed, photos_skipped, created_at, \
                started_at, completed_at, error_message \
         FROM analysis_jobs WHERE id = ?1",
        params![id],
        |row| {
            Ok(AnalysisJobDto {
                id: row.get(0)?,
                capability: row.get(1)?,
                provider_id: row.get(2)?,
                schema_version: row.get(3)?,
                scope_kind: row.get(4)?,
                scope_id: row.get(5)?,
                status: row.get(6)?,
                priority: row.get(7)?,
                photos_total: row.get(8)?,
                photos_done: row.get(9)?,
                photos_failed: row.get(10)?,
                photos_skipped: row.get(11)?,
                created_at: row.get(12)?,
                started_at: row.get(13)?,
                completed_at: row.get(14)?,
                error_message: row.get(15)?,
            })
        },
    );
    match row {
        Ok(job) => Ok(Some(job)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(err) => Err(format!("Failed to read analysis job: {}", err)),
    }
}

#[tauri::command]
pub fn analysis_results_cmd(
    app: AppHandle,
    photo_id: Option<String>,
    capability: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<AnalysisResultDto>, String> {
    let path = ensure_db(&app)?;
    let conn = open_database(&path)?;

    let mut sql = String::from(
        "SELECT photo_id, capability, provider_id, schema_version, result_json, confidence, generated_at \
         FROM analysis_results WHERE 1=1",
    );
    let mut bound: Vec<rusqlite::types::Value> = Vec::new();
    if let Some(pid) = photo_id.as_deref() {
        sql.push_str(" AND photo_id = ?");
        bound.push(rusqlite::types::Value::Text(pid.to_string()));
    }
    if let Some(cap) = capability.as_deref() {
        sql.push_str(" AND capability = ?");
        bound.push(rusqlite::types::Value::Text(cap.to_string()));
    }
    sql.push_str(" ORDER BY generated_at DESC LIMIT ?");
    bound.push(rusqlite::types::Value::Integer(limit.unwrap_or(50)));

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Failed to prepare results query: {}", e))?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(bound.iter()), |row| {
            let json: String = row.get(4)?;
            let parsed = serde_json::from_str(&json).unwrap_or(serde_json::Value::Null);
            let generated_at: String = row.get(6)?;
            // Normalize timestamps as RFC3339 if possible (already are, but
            // parse → format keeps invalid rows from crashing).
            let normalized = DateTime::parse_from_rfc3339(&generated_at)
                .map(|d| d.with_timezone(&Utc).to_rfc3339())
                .unwrap_or(generated_at);
            Ok(AnalysisResultDto {
                photo_id: row.get(0)?,
                capability: row.get(1)?,
                provider_id: row.get(2)?,
                schema_version: row.get(3)?,
                result: parsed,
                confidence: row.get(5)?,
                generated_at: normalized,
            })
        })
        .map_err(|e| format!("Failed to query results: {}", e))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("Failed to collect results: {}", e))?;
    Ok(rows)
}

#[tauri::command]
pub fn capabilities_list_cmd() -> Vec<CapabilityDescriptorDto> {
    let reg = registry();
    // Group capabilities by provider for a stable JSON shape.
    let mut by_provider: std::collections::BTreeMap<String, Vec<String>> = Default::default();
    for cap in [FACE_DETECT, FACE_EMBED, FACE_CLUSTER] {
        for provider_id in reg.providers_for(cap) {
            by_provider
                .entry(provider_id)
                .or_default()
                .push(cap.to_string());
        }
    }
    by_provider
        .into_iter()
        .map(|(provider_id, capabilities)| CapabilityDescriptorDto {
            provider_id,
            capabilities,
        })
        .collect()
}
