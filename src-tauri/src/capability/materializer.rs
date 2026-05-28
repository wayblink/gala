//! Materializers: reflect ledger rows in `analysis_results` into the
//! domain-specific tables (`faces`, eventually `persons`, scene labels, …).
//!
//! Why a separate module:
//! - Orchestrator stays capability-blind. It writes everyone's results to
//!   the generic `analysis_results` ledger and runs the matching
//!   materializer; it never knows what "a face" or "a scene" looks like.
//! - Schema changes happen in one place. If we ever need to re-derive
//!   `faces` after a bug fix, we re-run the materializer; the ledger is
//!   the source of truth.
//! - Capability-by-capability rollout. M1.3c only materializes face.detect.
//!   face.embed / face.cluster / scene labels each get their own function.

use chrono::Utc;
use rusqlite::{params, Connection};
use serde::Deserialize;
use uuid::Uuid;

use super::types::CapabilityError;

pub const FACE_DETECT: &str = "face.detect";

/// Materialize all face.detect results from a single job into `faces`.
///
/// Idempotent: for each (photo_id, provider_id) pair touched by the job
/// we first DELETE old rows so re-running a job produces a consistent
/// set. `person_id` is left NULL because clustering is M1.5.
///
/// Returns the count of `faces` rows written.
pub fn materialize_face_detect(
    conn: &mut Connection,
    job_id: &str,
) -> Result<usize, CapabilityError> {
    let tx = conn.transaction()?;
    let mut total_written: usize = 0;

    let rows: Vec<(String, String, String)> = {
        let mut stmt = tx.prepare(
            "SELECT photo_id, provider_id, result_json \
             FROM analysis_results \
             WHERE capability = ?1 AND job_id = ?2",
        )?;
        let collected = stmt
            .query_map(params![FACE_DETECT, job_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        collected
    };

    for (photo_id, provider_id, result_json) in rows {
        // Replace prior detections from the same (photo, provider) pair.
        // photo_faces references faces.id with a FK so it must be cleared
        // first; otherwise DELETE FROM faces blocks on the constraint.
        tx.execute(
            "DELETE FROM photo_faces WHERE photo_id = ?1 \
             AND face_id IN (SELECT id FROM faces WHERE photo_id = ?1 AND detected_by = ?2)",
            params![photo_id, provider_id],
        )?;
        tx.execute(
            "DELETE FROM faces WHERE photo_id = ?1 AND detected_by = ?2",
            params![photo_id, provider_id],
        )?;

        let parsed: FaceDetectResult = match serde_json::from_str(&result_json) {
            Ok(v) => v,
            Err(_) => continue, // skip malformed rows rather than abort
        };

        let now = Utc::now().to_rfc3339();
        for face in parsed.faces.iter() {
            let face_id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO faces \
                 (id, photo_id, detected_by, bbox_x, bbox_y, bbox_w, bbox_h, confidence, \
                  landmarks_json, embedding_path, embedding_dim, person_id, status, created_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, NULL, NULL, NULL, 'active', ?9)",
                params![
                    face_id,
                    photo_id,
                    provider_id,
                    face.bbox[0],
                    face.bbox[1],
                    face.bbox[2],
                    face.bbox[3],
                    face.confidence,
                    now,
                ],
            )?;
            tx.execute(
                "INSERT OR IGNORE INTO photo_faces (photo_id, face_id) VALUES (?1, ?2)",
                params![photo_id, face_id],
            )?;
            total_written += 1;
        }
    }

    tx.commit()?;
    Ok(total_written)
}

#[derive(Deserialize)]
struct FaceDetectResult {
    #[serde(default)]
    faces: Vec<FaceItem>,
}

#[derive(Deserialize)]
struct FaceItem {
    /// `[x, y, w, h]` normalized 0..1, origin upper-left (orchestrator
    /// convention enforced by MacosVisionFaceProvider).
    bbox: [f64; 4],
    #[serde(default)]
    confidence: f64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::storage::{initialize_schema, open_database};
    use rusqlite::params;
    use tempfile::TempDir;

    fn seed_db_with_face_detect_result(
        photo_count: usize,
        faces_per_photo: usize,
    ) -> (TempDir, Connection, String) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.db");
        let conn = open_database(&path).unwrap();
        initialize_schema(&conn).unwrap();

        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO sources (id, name, root_path, source_type, status, created_at, updated_at) \
             VALUES ('s', 't', '/p', 'local', 'online', ?1, ?1)",
            params![now],
        ).unwrap();

        let job_id = "job-1".to_string();
        conn.execute(
            "INSERT INTO analysis_jobs \
             (id, capability, provider_id, schema_version, scope_kind, scope_id, status, priority, \
              attempt_count, parent_job_id, config_json, started_at, completed_at, photos_total, \
              photos_done, photos_failed, photos_skipped, error_message, created_at) \
             VALUES (?1, 'face.detect', 'macos.vision.v1', 1, 'all', NULL, 'completed', 0, 1, NULL, '{}', \
                     ?2, ?2, ?3, ?3, 0, 0, NULL, ?2)",
            params![job_id, now, photo_count as i64],
        ).unwrap();

        for i in 0..photo_count {
            let pid = format!("p-{}", i);
            conn.execute(
                "INSERT INTO photos (id, source_id, relative_path, absolute_path_snapshot, file_name, \
                 extension, file_size, file_mtime, status, created_at, updated_at) \
                 VALUES (?1, 's', ?2, ?3, ?2, 'jpg', 1, 0, 'indexed', ?4, ?4)",
                params![pid, format!("{}.jpg", i), format!("/p/{}.jpg", i), now],
            ).unwrap();

            let faces_json: Vec<serde_json::Value> = (0..faces_per_photo)
                .map(|j| {
                    serde_json::json!({
                        "bbox": [0.1 * j as f64, 0.2, 0.3, 0.4],
                        "confidence": 0.9 - 0.05 * j as f64,
                    })
                })
                .collect();
            let blob = serde_json::json!({ "faces": faces_json }).to_string();

            conn.execute(
                "INSERT INTO analysis_results \
                 (photo_id, capability, provider_id, schema_version, result_json, confidence, job_id, generated_at) \
                 VALUES (?1, 'face.detect', 'macos.vision.v1', 1, ?2, ?3, ?4, ?5)",
                params![pid, blob, 0.9_f64, job_id, now],
            ).unwrap();
        }

        (dir, conn, job_id)
    }

    #[test]
    fn materializes_faces_from_job_results() {
        let (_d, mut conn, job_id) = seed_db_with_face_detect_result(3, 2);
        let written = materialize_face_detect(&mut conn, &job_id).unwrap();
        assert_eq!(written, 6);

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM faces", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 6);

        let pf_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM photo_faces", [], |r| r.get(0))
            .unwrap();
        assert_eq!(pf_count, 6);
    }

    #[test]
    fn re_materializing_replaces_prior_rows_for_same_provider() {
        let (_d, mut conn, job_id) = seed_db_with_face_detect_result(1, 3);
        materialize_face_detect(&mut conn, &job_id).unwrap();
        let first: i64 = conn
            .query_row("SELECT COUNT(*) FROM faces", [], |r| r.get(0))
            .unwrap();
        assert_eq!(first, 3);

        // Run again with no schema change — should DELETE then re-INSERT,
        // leaving the total count stable rather than doubled.
        let written = materialize_face_detect(&mut conn, &job_id).unwrap();
        assert_eq!(written, 3);
        let after: i64 = conn
            .query_row("SELECT COUNT(*) FROM faces", [], |r| r.get(0))
            .unwrap();
        assert_eq!(after, 3);
    }

    #[test]
    fn malformed_json_rows_are_skipped() {
        let (_d, mut conn, job_id) = seed_db_with_face_detect_result(2, 1);
        // Corrupt one row's JSON.
        conn.execute(
            "UPDATE analysis_results SET result_json = 'not-json' WHERE photo_id = 'p-0'",
            [],
        )
        .unwrap();

        let written = materialize_face_detect(&mut conn, &job_id).unwrap();
        assert_eq!(written, 1, "only the well-formed row materializes");
    }

    #[test]
    fn other_capabilities_in_same_job_are_ignored() {
        let (_d, mut conn, job_id) = seed_db_with_face_detect_result(1, 1);
        // Inject a scene-label result for the same photo / job — different
        // capability. Materializer must skip it.
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO analysis_results \
             (photo_id, capability, provider_id, schema_version, result_json, confidence, job_id, generated_at) \
             VALUES ('p-0', 'scene.detect', 'noop.v1', 1, '{}', 0.0, ?1, ?2)",
            params![job_id, now],
        )
        .unwrap();

        let written = materialize_face_detect(&mut conn, &job_id).unwrap();
        assert_eq!(written, 1);
    }
}
