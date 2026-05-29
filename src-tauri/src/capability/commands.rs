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
use tauri::AppHandle;
use tokio_util::sync::CancellationToken;

use crate::library::storage::{initialize_schema, migrate_schema, open_database};

use super::orchestrator::{Orchestrator, OrchestratorConfig};
use super::provider::NoopProvider;
use super::registry::CapabilityRegistry;
use super::resolve_scope;
use super::types::{AnalysisRequest, AnalyzeContext, AnalyzeInput, ScopeKind};

const FACE_DETECT: &str = "face.detect";
const FACE_EMBED: &str = "face.embed";
const FACE_CLUSTER: &str = "face.cluster";

static REGISTRY: OnceLock<Arc<CapabilityRegistry>> = OnceLock::new();

fn registry() -> Arc<CapabilityRegistry> {
    REGISTRY
        .get_or_init(|| {
            let mut reg = CapabilityRegistry::new();
            // On macOS register Vision providers first so they win
            // registry::select() for their respective capabilities (V0
            // priority = first registered wins).
            #[cfg(target_os = "macos")]
            {
                use super::macos_vision::MacosVisionFaceProvider;
                use super::macos_vision_embed::MacosVisionEmbedProvider;
                reg.register(Arc::new(MacosVisionFaceProvider::new()));
                reg.register(Arc::new(MacosVisionEmbedProvider::new()));
            }
            // NoopProvider stays as the fallback / advertiser for
            // face.cluster (still stubbed until M1.5) and as the
            // non-macOS face.detect / face.embed implementation.
            let noop = Arc::new(NoopProvider::new(
                "noop.v1",
                &[FACE_DETECT, FACE_EMBED, FACE_CLUSTER],
            ));
            reg.register(noop);
            Arc::new(reg)
        })
        .clone()
}

fn ensure_db(app: &AppHandle) -> Result<PathBuf, String> {
    // Reuse the library layer's DB path so photos/sources/faces all
    // live in one file. Previously this pointed at a separate
    // "library.db" via app_local_data_dir which caused scope=All to
    // return 0 photos even though the library had scanned 50.
    let path = crate::library::commands::get_db_path(app)?;
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
        Orchestrator::new(path.clone(), registry(), OrchestratorConfig { max_concurrency: 4 });
    let summary = orchestrator
        .run(internal, inputs, CancellationToken::new())
        .await
        .map_err(|e| e.to_string())?;

    // Capability-specific materializer hook. For face.detect we reflect the
    // ledger rows into the `faces` domain table so the UI can render them
    // without re-parsing JSON. Best-effort: failures here don't fail the
    // command, they just leave the ledger as the source of truth.
    if capability == FACE_DETECT && summary.photos_done > 0 {
        if let Ok(mut conn) = open_database(&path) {
            match super::materialize_face_detect(&mut conn, &summary.job_id) {
                Ok(n) => eprintln!("[materializer] face.detect job {} -> {} faces", summary.job_id, n),
                Err(e) => eprintln!("[materializer] face.detect job {} failed: {}", summary.job_id, e),
            }
        }
    }

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

#[derive(Debug, Serialize)]
pub struct FaceDto {
    pub id: String,
    pub photo_id: String,
    pub detected_by: String,
    pub bbox_x: f64,
    pub bbox_y: f64,
    pub bbox_w: f64,
    pub bbox_h: f64,
    pub confidence: f64,
    pub person_id: Option<String>,
    pub thumbnail_path: Option<String>,
    pub file_name: Option<String>,
    pub embedding_dim: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct FaceSummaryDto {
    pub total_faces: i64,
    pub photos_with_faces: i64,
    pub unassigned_faces: i64,
    pub faces_with_embedding: i64,
}

#[tauri::command]
pub fn faces_list_cmd(app: AppHandle, limit: Option<i64>) -> Result<Vec<FaceDto>, String> {
    let path = ensure_db(&app)?;
    let conn = open_database(&path)?;
    let lim = limit.unwrap_or(100);
    let mut stmt = conn
        .prepare(
            "SELECT f.id, f.photo_id, f.detected_by, f.bbox_x, f.bbox_y, f.bbox_w, f.bbox_h, \
                    f.confidence, f.person_id, pa.thumbnail_medium_path, p.file_name, \
                    f.embedding_dim \
             FROM faces f \
             LEFT JOIN photos p ON p.id = f.photo_id \
             LEFT JOIN photo_assets pa ON pa.photo_id = f.photo_id \
             WHERE f.status = 'active' \
             ORDER BY f.confidence DESC, f.created_at DESC \
             LIMIT ?1",
        )
        .map_err(|e| format!("Failed to prepare faces query: {}", e))?;
    let rows = stmt
        .query_map(params![lim], |row| {
            Ok(FaceDto {
                id: row.get(0)?,
                photo_id: row.get(1)?,
                detected_by: row.get(2)?,
                bbox_x: row.get(3)?,
                bbox_y: row.get(4)?,
                bbox_w: row.get(5)?,
                bbox_h: row.get(6)?,
                confidence: row.get(7)?,
                person_id: row.get(8)?,
                thumbnail_path: row.get(9)?,
                file_name: row.get(10)?,
                embedding_dim: row.get(11)?,
            })
        })
        .map_err(|e| format!("Failed to query faces: {}", e))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("Failed to collect faces: {}", e))?;
    Ok(rows)
}

#[tauri::command]
pub fn faces_summary_cmd(app: AppHandle) -> Result<FaceSummaryDto, String> {
    let path = ensure_db(&app)?;
    let conn = open_database(&path)?;
    let total_faces: i64 = conn
        .query_row("SELECT COUNT(*) FROM faces WHERE status = 'active'", [], |r| r.get(0))
        .map_err(|e| format!("Failed to count faces: {}", e))?;
    let photos_with_faces: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT photo_id) FROM faces WHERE status = 'active'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| format!("Failed to count photos: {}", e))?;
    let unassigned_faces: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM faces WHERE status = 'active' AND person_id IS NULL",
            [],
            |r| r.get(0),
        )
        .map_err(|e| format!("Failed to count unassigned: {}", e))?;
    let faces_with_embedding: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM faces WHERE status = 'active' \
             AND embedding_path IS NOT NULL AND embedding_path != ''",
            [],
            |r| r.get(0),
        )
        .map_err(|e| format!("Failed to count embedded faces: {}", e))?;
    Ok(FaceSummaryDto {
        total_faces,
        photos_with_faces,
        unassigned_faces,
        faces_with_embedding,
    })
}

#[derive(Debug, Serialize)]
pub struct EmbedSummaryDto {
    pub photos_processed: i64,
    pub faces_embedded: i64,
    pub faces_failed: i64,
    pub faces_skipped: i64,
}

/// Generate face embeddings for any active faces row whose embedding_path
/// is still NULL. Bypasses the orchestrator because (a) face.embed needs
/// per-photo bbox bundles that don't fit the scope resolver, and (b) the
/// orchestrator currently drops Artifact bytes — embeddings have to land
/// on disk synchronously inside this command.
///
/// Artifact layout (RFC §3.3):
///   data/artifacts/<photo_id>/face.embed/<provider_id>/<face_id>.bin
#[tauri::command]
pub async fn analysis_embed_faces_cmd(
    app: AppHandle,
    limit: Option<i64>,
) -> Result<EmbedSummaryDto, String> {
    let db_path = ensure_db(&app)?;
    let artifact_root = artifact_dir(&app)?;
    let cap_per_photo = limit.unwrap_or(500);

    // Pick the embed provider explicitly so we don't accidentally invoke
    // NoopProvider on platforms where the Vision provider didn't register.
    let provider = registry().select(FACE_EMBED).ok_or_else(|| {
        "no provider registered for face.embed".to_string()
    })?;
    let provider_id = provider.id();
    let schema_version = provider.schema_version(FACE_EMBED);

    // Gather pending faces grouped by photo. Each photo becomes one
    // AnalyzeInput; the meta.faces array carries the bbox list.
    let pending = collect_pending_face_embeds(&db_path, &provider_id, cap_per_photo)?;
    if pending.is_empty() {
        return Ok(EmbedSummaryDto {
            photos_processed: 0,
            faces_embedded: 0,
            faces_failed: 0,
            faces_skipped: 0,
        });
    }

    let cancel = CancellationToken::new();
    let ctx = AnalyzeContext {
        job_id: format!("embed-{}", uuid::Uuid::new_v4()),
        cancel: cancel.clone(),
        config: serde_json::json!({}),
    };

    let mut photos_processed = 0_i64;
    let mut faces_embedded = 0_i64;
    let mut faces_failed = 0_i64;

    for batch in pending {
        photos_processed += 1;
        let face_count = batch.faces.len() as i64;
        let input = AnalyzeInput {
            photo_id: batch.photo_id.clone(),
            image_path: batch.image_path.clone(),
            thumbnail_path: None,
            hint_dimensions: None,
            meta: serde_json::json!({ "faces": batch.faces_meta() }),
        };

        let output = match provider.analyze(&ctx, FACE_EMBED, &input).await {
            Ok(o) => o,
            Err(e) => {
                eprintln!("[embed] {} provider error: {}", batch.photo_id, e);
                faces_failed += face_count;
                continue;
            }
        };

        // Match each artifact to its face_id by walking embeddings_info.
        let info = output
            .result
            .get("embeddings")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let mut artifact_iter = output.artifacts.into_iter();
        for entry in info {
            let face_id = entry
                .get("face_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let dim = entry.get("dim").and_then(|v| v.as_u64()).unwrap_or(0);
            if dim == 0 {
                faces_failed += 1;
                continue;
            }
            let artifact = match artifact_iter.next() {
                Some(a) => a,
                None => {
                    faces_failed += 1;
                    continue;
                }
            };
            let target = artifact_root
                .join(&batch.photo_id)
                .join("face.embed")
                .join(&provider_id)
                .join(format!("{}.bin", face_id));
            if let Some(parent) = target.parent() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    eprintln!("[embed] mkdir {}: {}", parent.display(), e);
                    faces_failed += 1;
                    continue;
                }
            }
            if let Err(e) = std::fs::write(&target, &artifact.bytes) {
                eprintln!("[embed] write {}: {}", target.display(), e);
                faces_failed += 1;
                continue;
            }
            // Persist embedding pointer on the face row.
            let conn = open_database(&db_path)?;
            let updated = conn
                .execute(
                    "UPDATE faces SET embedding_path = ?1, embedding_dim = ?2 WHERE id = ?3",
                    params![target.to_string_lossy().to_string(), dim as i64, face_id],
                )
                .map_err(|e| format!("Failed to update face {}: {}", face_id, e))?;
            if updated == 0 {
                faces_failed += 1;
                continue;
            }
            faces_embedded += 1;
        }
        // Any remaining artifacts (shouldn't happen) — log and drop.
        for orphan in artifact_iter {
            eprintln!(
                "[embed] orphan artifact ({} bytes) for {} dropped",
                orphan.bytes.len(),
                batch.photo_id
            );
        }

        // Append a single ledger row per photo recording the run.
        let conn = open_database(&db_path)?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR REPLACE INTO analysis_results \
             (photo_id, capability, provider_id, schema_version, result_json, confidence, job_id, generated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7)",
            params![
                batch.photo_id,
                FACE_EMBED,
                provider_id,
                schema_version as i64,
                output.result.to_string(),
                output.confidence.map(|c| c as f64),
                now,
            ],
        )
        .map_err(|e| format!("Failed to insert analysis_results: {}", e))?;
    }

    let faces_skipped = 0; // collect_pending_face_embeds already filters

    Ok(EmbedSummaryDto {
        photos_processed,
        faces_embedded,
        faces_failed,
        faces_skipped,
    })
}

#[derive(Debug, Serialize)]
pub struct ClusterSummaryDto {
    pub faces_loaded: i64,
    pub faces_failed: i64,
    pub persons_created: i64,
    pub persons_existing: i64,
}

#[tauri::command]
pub fn analysis_cluster_faces_cmd(app: AppHandle) -> Result<ClusterSummaryDto, String> {
    let path = ensure_db(&app)?;
    let mut conn = open_database(&path)?;
    let summary = super::cluster_faces(&mut conn).map_err(|e| e.to_string())?;
    Ok(ClusterSummaryDto {
        faces_loaded: summary.faces_loaded,
        faces_failed: summary.faces_failed,
        persons_created: summary.persons_created,
        persons_existing: summary.persons_existing,
    })
}

#[derive(Debug, Serialize)]
pub struct PersonDto {
    pub id: String,
    pub display_name: Option<String>,
    pub face_count: i64,
    pub photo_count: i64,
    pub rep_face_id: Option<String>,
    pub rep_thumbnail_path: Option<String>,
    pub rep_bbox_x: Option<f64>,
    pub rep_bbox_y: Option<f64>,
    pub rep_bbox_w: Option<f64>,
    pub rep_bbox_h: Option<f64>,
    pub cluster_method: String,
}

#[tauri::command]
pub fn persons_list_cmd(app: AppHandle, limit: Option<i64>) -> Result<Vec<PersonDto>, String> {
    let path = ensure_db(&app)?;
    let conn = open_database(&path)?;
    let lim = limit.unwrap_or(200);
    let mut stmt = conn
        .prepare(
            "SELECT pe.id, pe.display_name, pe.face_count, pe.cluster_method, \
                    pe.rep_face_id, pa.thumbnail_medium_path, \
                    f.bbox_x, f.bbox_y, f.bbox_w, f.bbox_h, \
                    (SELECT COUNT(DISTINCT photo_id) FROM faces WHERE person_id = pe.id) AS photo_count \
             FROM persons pe \
             LEFT JOIN faces f ON f.id = pe.rep_face_id \
             LEFT JOIN photo_assets pa ON pa.photo_id = f.photo_id \
             WHERE pe.is_hidden = 0 AND pe.merged_into IS NULL \
             ORDER BY pe.face_count DESC \
             LIMIT ?1",
        )
        .map_err(|e| format!("Failed to prepare persons query: {}", e))?;
    let rows = stmt
        .query_map(params![lim], |row| {
            Ok(PersonDto {
                id: row.get(0)?,
                display_name: row.get(1)?,
                face_count: row.get(2)?,
                cluster_method: row.get(3)?,
                rep_face_id: row.get(4)?,
                rep_thumbnail_path: row.get(5)?,
                rep_bbox_x: row.get(6)?,
                rep_bbox_y: row.get(7)?,
                rep_bbox_w: row.get(8)?,
                rep_bbox_h: row.get(9)?,
                photo_count: row.get(10)?,
            })
        })
        .map_err(|e| format!("Failed to query persons: {}", e))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("Failed to collect persons: {}", e))?;
    Ok(rows)
}

#[tauri::command]
pub fn set_person_name_cmd(
    app: AppHandle,
    person_id: String,
    name: Option<String>,
) -> Result<(), String> {
    let path = ensure_db(&app)?;
    let conn = open_database(&path)?;
    // Trim + treat empty string as "clear the name". This matches the
    // ergonomic expectation: deleting the text in the UI input + saving
    // should reset to the synthetic 'Person · <id6>' fallback rather than
    // leaving an empty string display_name in the DB.
    let normalized: Option<String> = match name {
        Some(s) => {
            let t = s.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        }
        None => None,
    };
    let now = chrono::Utc::now().to_rfc3339();
    let n = conn
        .execute(
            "UPDATE persons SET display_name = ?1, updated_at = ?2 WHERE id = ?3",
            params![normalized, now, person_id],
        )
        .map_err(|e| format!("Failed to set person name: {}", e))?;
    if n == 0 {
        return Err(format!("person not found: {}", person_id));
    }
    Ok(())
}

struct PhotoBatch {
    photo_id: String,
    image_path: PathBuf,
    faces: Vec<(String, [f64; 4])>, // (face_id, bbox)
}

impl PhotoBatch {
    fn faces_meta(&self) -> serde_json::Value {
        serde_json::Value::Array(
            self.faces
                .iter()
                .map(|(id, b)| {
                    serde_json::json!({
                        "face_id": id,
                        "bbox": [b[0], b[1], b[2], b[3]],
                    })
                })
                .collect(),
        )
    }
}

fn collect_pending_face_embeds(
    db_path: &PathBuf,
    provider_id: &str,
    cap_per_photo: i64,
) -> Result<Vec<PhotoBatch>, String> {
    let conn = open_database(db_path)?;
    // Pull (photo_id, root_path, relative_path, face_id, bbox_*) for any
    // active face that lacks an embedding from THIS provider.
    let mut stmt = conn
        .prepare(
            "SELECT f.id, f.photo_id, f.bbox_x, f.bbox_y, f.bbox_w, f.bbox_h, \
                    s.root_path, p.relative_path \
             FROM faces f \
             INNER JOIN photos p ON p.id = f.photo_id \
             INNER JOIN sources s ON s.id = p.source_id \
             WHERE f.status = 'active' \
               AND (f.embedding_path IS NULL OR f.embedding_path = '') \
             ORDER BY f.photo_id, f.created_at",
        )
        .map_err(|e| format!("Failed to prepare pending faces query: {}", e))?;
    let rows = stmt
        .query_map([], |row| {
            let face_id: String = row.get(0)?;
            let photo_id: String = row.get(1)?;
            let bx: f64 = row.get(2)?;
            let by: f64 = row.get(3)?;
            let bw: f64 = row.get(4)?;
            let bh: f64 = row.get(5)?;
            let root_path: String = row.get(6)?;
            let relative_path: String = row.get(7)?;
            Ok((face_id, photo_id, [bx, by, bw, bh], root_path, relative_path))
        })
        .map_err(|e| format!("Failed to query pending faces: {}", e))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("Failed to collect pending faces: {}", e))?;

    let _ = provider_id; // reserved for future per-provider caches; kept on
                         // the signature so callers can scope by provider.

    let mut batches: Vec<PhotoBatch> = Vec::new();
    for (face_id, photo_id, bbox, root_path, relative_path) in rows {
        let absolute = if relative_path.is_empty() {
            PathBuf::from(&root_path)
        } else {
            std::path::Path::new(&root_path).join(&relative_path)
        };
        match batches.last_mut() {
            Some(last) if last.photo_id == photo_id => {
                if (last.faces.len() as i64) < cap_per_photo {
                    last.faces.push((face_id, bbox));
                }
            }
            _ => {
                batches.push(PhotoBatch {
                    photo_id: photo_id.clone(),
                    image_path: absolute,
                    faces: vec![(face_id, bbox)],
                });
            }
        }
    }
    Ok(batches)
}

fn artifact_dir(app: &AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let dir = app_data_dir.join("artifacts");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create artifacts dir: {}", e))?;
    Ok(dir)
}
