//! Persistence helpers for analysis_jobs / analysis_events / analysis_results.
//!
//! These helpers operate on a fresh rusqlite Connection per call, matching the
//! pattern used elsewhere in `library::commands` (open-use-drop, no shared
//! Mutex). The orchestrator opens its own connection for every state
//! transition, so the helpers stay pure SQL.

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use super::types::{AnalyzeOutput, AnalysisRequest, CapabilityError, JobStatus};

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct JobRecord {
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
    pub error_message: Option<String>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

pub fn insert_job(
    conn: &Connection,
    req: &AnalysisRequest,
    provider_id: &str,
    schema_version: u32,
) -> Result<JobRecord, CapabilityError> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let config_json = serde_json::to_string(&req.config).unwrap_or_else(|_| "{}".to_string());
    conn.execute(
        "INSERT INTO analysis_jobs (
            id, capability, provider_id, schema_version, scope_kind, scope_id,
            status, priority, attempt_count, parent_job_id, config_json,
            started_at, completed_at,
            photos_total, photos_done, photos_failed, photos_skipped,
            error_message, created_at
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6,
            ?7, ?8, 0, NULL, ?9,
            NULL, NULL,
            0, 0, 0, 0,
            NULL, ?10
        )",
        params![
            id,
            req.capability,
            provider_id,
            schema_version as i64,
            req.scope_kind.as_str(),
            req.scope_id,
            JobStatus::Queued.as_str(),
            req.priority,
            config_json,
            now,
        ],
    )?;
    fetch_job(conn, &id).map(|opt| opt.expect("inserted job missing"))
}

pub fn fetch_job(conn: &Connection, job_id: &str) -> Result<Option<JobRecord>, CapabilityError> {
    conn.query_row(
        "SELECT id, capability, provider_id, schema_version, scope_kind, scope_id, status, priority, \
                photos_total, photos_done, photos_failed, photos_skipped, error_message, created_at, \
                started_at, completed_at \
         FROM analysis_jobs WHERE id = ?1",
        params![job_id],
        |row| {
            Ok(JobRecord {
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
                error_message: row.get(12)?,
                created_at: row.get(13)?,
                started_at: row.get(14)?,
                completed_at: row.get(15)?,
            })
        },
    )
    .optional()
    .map_err(CapabilityError::from)
}

pub fn mark_running(
    conn: &Connection,
    job_id: &str,
    photos_total: i64,
) -> Result<(), CapabilityError> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE analysis_jobs \
         SET status = ?1, started_at = ?2, photos_total = ?3, attempt_count = attempt_count + 1 \
         WHERE id = ?4",
        params![JobStatus::Running.as_str(), now, photos_total, job_id],
    )?;
    Ok(())
}

pub fn mark_done_counts(
    conn: &Connection,
    job_id: &str,
    done: i64,
    failed: i64,
    skipped: i64,
) -> Result<(), CapabilityError> {
    conn.execute(
        "UPDATE analysis_jobs SET photos_done = ?1, photos_failed = ?2, photos_skipped = ?3 WHERE id = ?4",
        params![done, failed, skipped, job_id],
    )?;
    Ok(())
}

pub fn finalize_job(
    conn: &Connection,
    job_id: &str,
    status: JobStatus,
    error: Option<&str>,
) -> Result<(), CapabilityError> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE analysis_jobs SET status = ?1, completed_at = ?2, error_message = ?3 WHERE id = ?4",
        params![status.as_str(), now, error, job_id],
    )?;
    Ok(())
}

pub fn append_event(
    conn: &Connection,
    job_id: &str,
    photo_id: Option<&str>,
    event_type: &str,
    message: Option<&str>,
    result_summary: Option<&str>,
) -> Result<(), CapabilityError> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO analysis_events (id, analysis_job_id, photo_id, event_type, message, result_summary, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, job_id, photo_id, event_type, message, result_summary, now],
    )?;
    Ok(())
}

pub fn upsert_result(
    conn: &Connection,
    photo_id: &str,
    job_id: &str,
    out: &AnalyzeOutput,
) -> Result<(), CapabilityError> {
    let now = Utc::now().to_rfc3339();
    let result_json = serde_json::to_string(&out.result)
        .map_err(|e| CapabilityError::Storage(format!("serialize result: {}", e)))?;
    // INSERT OR REPLACE keyed by the composite PK; we want re-runs to overwrite
    // stale ledger rows when the user passes force=true.
    conn.execute(
        "INSERT OR REPLACE INTO analysis_results \
         (photo_id, capability, provider_id, schema_version, result_json, confidence, job_id, generated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            photo_id,
            out.capability,
            out.provider_id,
            out.schema_version as i64,
            result_json,
            out.confidence.map(|c| c as f64),
            job_id,
            now,
        ],
    )?;
    Ok(())
}

pub fn result_exists(
    conn: &Connection,
    photo_id: &str,
    capability: &str,
    provider_id: &str,
    schema_version: u32,
) -> Result<bool, CapabilityError> {
    let exists: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM analysis_results \
             WHERE photo_id = ?1 AND capability = ?2 AND provider_id = ?3 AND schema_version = ?4",
            params![photo_id, capability, provider_id, schema_version as i64],
            |row| row.get(0),
        )
        .optional()?;
    Ok(exists.is_some())
}

#[cfg(test)]
pub fn count_events(conn: &Connection, job_id: &str) -> Result<i64, CapabilityError> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM analysis_events WHERE analysis_job_id = ?1",
        params![job_id],
        |row| row.get(0),
    )?;
    Ok(n)
}

#[cfg(test)]
pub fn count_results(
    conn: &Connection,
    job_id: &str,
) -> Result<i64, CapabilityError> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM analysis_results WHERE job_id = ?1",
        params![job_id],
        |row| row.get(0),
    )?;
    Ok(n)
}
