//! face.cluster — group face embeddings into persons.
//!
//! Algorithm (V0):
//! 1. Load every active face row whose embedding_path is present.
//! 2. Read each .bin into a Vec<f32>; expected element count comes from
//!    faces.embedding_dim. Skip faces whose file is missing or whose
//!    bytes don't decode cleanly.
//! 3. Build an HNSW index over the embedding vectors using cosine
//!    distance.
//! 4. Iterate every face; for each, query the K=10 nearest neighbours
//!    within cosine distance ≤ THRESHOLD (0.55, locked in RFC §9 Q4).
//!    Use union-find to merge connected components.
//! 5. Each component becomes a `persons` row; per-face person_id gets
//!    UPDATEd; representative face is the highest-confidence member of
//!    each cluster (RFC §9 Q5 user pick).
//!
//! All-or-nothing: a single transaction wipes prior auto-clustered
//! persons (cluster_method='hnsw.v1') and rewrites them. Manual
//! cluster_method rows are preserved so user-named persons survive
//! re-clustering. Faces previously assigned to manual persons keep
//! their person_id.

use chrono::Utc;
use hnsw_rs::prelude::{AnnT, DistCosine, Hnsw};
use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::path::PathBuf;
use uuid::Uuid;

use super::types::CapabilityError;

pub const FACE_CLUSTER: &str = "face.cluster";
pub const PROVIDER_ID: &str = "cpu.hnsw.v1";

/// Cosine distance threshold above which two faces are NOT considered
/// the same person. RFC §9 Q4: locked at 0.55, no UI exposure in V0.
const THRESHOLD: f32 = 0.55;
const NEIGHBOURS: usize = 10;

#[derive(Debug)]
pub struct ClusterSummary {
    pub faces_loaded: i64,
    pub faces_failed: i64,
    pub persons_created: i64,
    pub persons_existing: i64,
}

#[derive(Debug, Clone)]
struct LoadedFace {
    id: String,
    confidence: f32,
    embedding: Vec<f32>,
    /// person_id this face was assigned to BEFORE this clustering run.
    /// Used to vote for a stable person identity so re-clustering keeps
    /// the same UUID (and thus user-assigned display_name / is_hidden)
    /// for clusters that stay coherent.
    old_person_id: Option<String>,
}

pub fn cluster_faces(conn: &mut Connection) -> Result<ClusterSummary, CapabilityError> {
    let faces = load_face_embeddings(conn)?;
    let faces_loaded = faces.len() as i64;
    if faces.is_empty() {
        return Ok(ClusterSummary {
            faces_loaded: 0,
            faces_failed: 0,
            persons_created: 0,
            persons_existing: count_existing_persons(conn)?,
        });
    }

    let assignments = run_hnsw(&faces);
    let n_clusters = assignments
        .iter()
        .copied()
        .max()
        .map(|m| m + 1)
        .unwrap_or(0);

    let tx = conn.transaction()?;

    // Snapshot existing auto-clustered persons so we can reuse their UUIDs
    // (and the user-assigned display_name / is_hidden riding on them) when a
    // re-cluster produces a coherent successor cluster. Manual persons
    // (cluster_method != hnsw) are never touched here.
    let existing_persons: HashMap<String, ()> = {
        let mut stmt = tx.prepare(
            "SELECT id FROM persons WHERE cluster_method = ?1",
        )?;
        let ids = stmt
            .query_map(params![PROVIDER_ID], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        ids.into_iter().map(|id| (id, ())).collect()
    };

    // Detach faces from their auto-clustered persons. We re-assign below.
    tx.execute(
        "UPDATE faces SET person_id = NULL WHERE person_id IN \
         (SELECT id FROM persons WHERE cluster_method = ?1)",
        params![PROVIDER_ID],
    )?;

    let mut by_cluster: Vec<Vec<usize>> = vec![Vec::new(); n_clusters];
    for (idx, &cluster_id) in assignments.iter().enumerate() {
        by_cluster[cluster_id].push(idx);
    }

    let now = Utc::now().to_rfc3339();
    let mut persons_created = 0_i64;
    let mut persons_reused = 0_i64;
    let mut claimed: std::collections::HashSet<String> = std::collections::HashSet::new();

    for members in by_cluster.iter() {
        if members.is_empty() {
            continue;
        }
        // Representative face: highest confidence within the cluster.
        let rep = members
            .iter()
            .copied()
            .max_by(|&a, &b| {
                faces[a]
                    .confidence
                    .partial_cmp(&faces[b].confidence)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .map(|i| faces[i].id.clone())
            .unwrap_or_default();

        // Vote for a stable identity: of the faces in this cluster, which
        // prior person_id appears most often? That person "inherits" this
        // cluster, keeping its UUID + display_name. Skip ids that were
        // already claimed by an earlier cluster this run (a split) or that
        // no longer exist.
        let mut votes: HashMap<&str, usize> = HashMap::new();
        for &idx in members {
            if let Some(pid) = faces[idx].old_person_id.as_deref() {
                if existing_persons.contains_key(pid) && !claimed.contains(pid) {
                    *votes.entry(pid).or_insert(0) += 1;
                }
            }
        }
        let inherited = votes
            .into_iter()
            .max_by_key(|(_, count)| *count)
            .map(|(pid, _)| pid.to_string());

        let person_id = match inherited {
            Some(pid) => {
                tx.execute(
                    "UPDATE persons SET rep_face_id = ?1, face_count = ?2, updated_at = ?3 \
                     WHERE id = ?4",
                    params![rep, members.len() as i64, now, pid],
                )?;
                persons_reused += 1;
                claimed.insert(pid.clone());
                pid
            }
            None => {
                let pid = Uuid::new_v4().to_string();
                tx.execute(
                    "INSERT INTO persons \
                     (id, display_name, rep_face_id, cluster_method, face_count, is_hidden, \
                      merged_into, created_at, updated_at) \
                     VALUES (?1, NULL, ?2, ?3, ?4, 0, NULL, ?5, ?5)",
                    params![pid, rep, PROVIDER_ID, members.len() as i64, now],
                )?;
                persons_created += 1;
                claimed.insert(pid.clone());
                pid
            }
        };

        for &idx in members {
            tx.execute(
                "UPDATE faces SET person_id = ?1 WHERE id = ?2",
                params![person_id, faces[idx].id],
            )?;
        }
    }

    // Delete any prior auto-clustered persons that no successor cluster
    // claimed (their faces dropped out, e.g. embeddings deleted).
    {
        let mut stmt = tx.prepare(
            "SELECT id FROM persons WHERE cluster_method = ?1",
        )?;
        let stale: Vec<String> = stmt
            .query_map(params![PROVIDER_ID], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?
            .into_iter()
            .filter(|id| !claimed.contains(id))
            .collect();
        drop(stmt);
        for id in stale {
            tx.execute("DELETE FROM persons WHERE id = ?1", params![id])?;
        }
    }

    tx.commit()?;

    Ok(ClusterSummary {
        faces_loaded,
        faces_failed: 0,
        persons_created,
        persons_existing: persons_reused,
    })
}

fn count_existing_persons(conn: &Connection) -> Result<i64, CapabilityError> {
    let n: i64 = conn.query_row("SELECT COUNT(*) FROM persons", [], |r| r.get(0))?;
    Ok(n)
}

fn load_face_embeddings(conn: &Connection) -> Result<Vec<LoadedFace>, CapabilityError> {
    let mut stmt = conn.prepare(
        "SELECT id, confidence, embedding_path, embedding_dim \
         FROM faces \
         WHERE status = 'active' \
           AND embedding_path IS NOT NULL AND embedding_path != '' \
           AND embedding_dim IS NOT NULL AND embedding_dim > 0",
    )?;
    let rows: Vec<(String, f32, String, i64)> = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let confidence: f64 = row.get(1)?;
            let path: String = row.get(2)?;
            let dim: i64 = row.get(3)?;
            Ok((id, confidence as f32, path, dim))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut out = Vec::with_capacity(rows.len());
    for (id, confidence, path, dim) in rows {
        let bytes = match std::fs::read(&path) {
            Ok(b) => b,
            Err(e) => {
                eprintln!("[cluster] {}: read {} failed: {}", id, path, e);
                continue;
            }
        };
        let expected = dim as usize * 4;
        if bytes.len() != expected {
            eprintln!(
                "[cluster] {}: embedding size mismatch (got {}, expected {})",
                id,
                bytes.len(),
                expected
            );
            continue;
        }
        let mut floats = Vec::with_capacity(dim as usize);
        for chunk in bytes.chunks_exact(4) {
            let arr: [u8; 4] = chunk.try_into().unwrap();
            floats.push(f32::from_le_bytes(arr));
        }
        out.push(LoadedFace {
            id,
            confidence,
            embedding: floats,
        });
    }
    Ok(out)
}

/// Returns a Vec<usize> the same length as `faces` where each element is
/// the cluster id (0..n_clusters) for that face.
fn run_hnsw(faces: &[LoadedFace]) -> Vec<usize> {
    let n = faces.len();
    if n == 0 {
        return Vec::new();
    }
    if n == 1 {
        return vec![0];
    }

    // Build the index. Defaults from hnsw_rs README: ef_construction 200,
    // M=16, max_layer ln(N).
    let mut hnsw: Hnsw<'_, f32, DistCosine> =
        Hnsw::new(16, n, 16, 200, DistCosine);
    let to_insert: Vec<(&[f32], usize)> =
        faces.iter().enumerate().map(|(i, f)| (f.embedding.as_slice(), i)).collect();
    hnsw.parallel_insert_slice(&to_insert);

    // Union-find over face indices.
    let mut parent: Vec<usize> = (0..n).collect();
    fn find(parent: &mut [usize], mut x: usize) -> usize {
        while parent[x] != x {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        x
    }
    fn union(parent: &mut [usize], a: usize, b: usize) {
        let ra = find(parent, a);
        let rb = find(parent, b);
        if ra != rb {
            parent[ra] = rb;
        }
    }

    let ef_search = NEIGHBOURS.max(32);
    for (i, face) in faces.iter().enumerate() {
        let neighbours = hnsw.search(&face.embedding, NEIGHBOURS, ef_search);
        for n_info in neighbours {
            // n_info.d_id is neighbour's data id (the usize we passed to insert).
            // n_info.distance is the cosine distance.
            if n_info.d_id == i {
                continue;
            }
            if n_info.distance <= THRESHOLD {
                union(&mut parent, i, n_info.d_id);
            }
        }
    }

    // Compact roots into 0..n_clusters.
    let mut roots: HashMap<usize, usize> = HashMap::new();
    let mut assignments = Vec::with_capacity(n);
    for i in 0..n {
        let r = find(&mut parent, i);
        let next = roots.len();
        let cluster = *roots.entry(r).or_insert(next);
        assignments.push(cluster);
    }
    assignments
}

/// Resolve absolute artifact path for a face id under the data directory.
/// Used by the analysis_cluster_faces_cmd in commands.rs to locate
/// `.bin` files when not embedded inline.
#[allow(dead_code)]
pub fn artifact_path_for(
    artifact_root: &PathBuf,
    photo_id: &str,
    provider_id: &str,
    face_id: &str,
) -> PathBuf {
    artifact_root
        .join(photo_id)
        .join("face.embed")
        .join(provider_id)
        .join(format!("{}.bin", face_id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::storage::{initialize_schema, open_database};
    use rusqlite::params;
    use std::path::PathBuf;
    use tempfile::TempDir;

    fn write_embedding(dir: &PathBuf, face_id: &str, vec: &[f32]) -> String {
        let path = dir.join(format!("{}.bin", face_id));
        let mut bytes = Vec::with_capacity(vec.len() * 4);
        for &v in vec {
            bytes.extend_from_slice(&v.to_le_bytes());
        }
        std::fs::write(&path, &bytes).unwrap();
        path.to_string_lossy().to_string()
    }

    fn seed_face(
        conn: &Connection,
        face_id: &str,
        photo_id: &str,
        confidence: f64,
        emb_path: &str,
        emb_dim: usize,
    ) {
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR IGNORE INTO sources \
             (id, name, root_path, source_type, status, created_at, updated_at) \
             VALUES ('s', 't', '/p', 'local', 'online', ?1, ?1)",
            params![now],
        ).unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO photos (id, source_id, relative_path, absolute_path_snapshot, file_name, \
             extension, file_size, file_mtime, status, created_at, updated_at) \
             VALUES (?1, 's', ?2, ?3, ?2, 'jpg', 1, 0, 'indexed', ?4, ?4)",
            params![photo_id, format!("{}.jpg", photo_id), format!("/p/{}.jpg", photo_id), now],
        ).unwrap();
        conn.execute(
            "INSERT INTO faces \
             (id, photo_id, detected_by, bbox_x, bbox_y, bbox_w, bbox_h, confidence, \
              landmarks_json, embedding_path, embedding_dim, person_id, status, created_at) \
             VALUES (?1, ?2, 'macos.vision.v1', 0.1, 0.1, 0.1, 0.1, ?3, NULL, ?4, ?5, NULL, 'active', ?6)",
            params![face_id, photo_id, confidence, emb_path, emb_dim as i64, now],
        ).unwrap();
    }

    fn setup() -> (TempDir, Connection) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("t.db");
        let conn = open_database(&path).unwrap();
        initialize_schema(&conn).unwrap();
        (dir, conn)
    }

    #[test]
    fn no_faces_yields_empty_summary() {
        let (_d, mut conn) = setup();
        let summary = cluster_faces(&mut conn).unwrap();
        assert_eq!(summary.faces_loaded, 0);
        assert_eq!(summary.persons_created, 0);
    }

    #[test]
    fn merges_close_embeddings_into_one_person() {
        let (d, mut conn) = setup();
        let dir = d.path().to_path_buf();
        // Two clusters: A=[1,0,0,0] near, B=[0,1,0,0] near.
        let a1 = write_embedding(&dir, "f1", &[1.0, 0.05, 0.0, 0.0]);
        let a2 = write_embedding(&dir, "f2", &[0.95, 0.0, 0.0, 0.0]);
        let b1 = write_embedding(&dir, "f3", &[0.0, 1.0, 0.05, 0.0]);
        seed_face(&conn, "f1", "p1", 0.9, &a1, 4);
        seed_face(&conn, "f2", "p2", 0.7, &a2, 4);
        seed_face(&conn, "f3", "p3", 0.85, &b1, 4);

        let summary = cluster_faces(&mut conn).unwrap();
        assert_eq!(summary.faces_loaded, 3);
        assert_eq!(summary.persons_created, 2);

        // f1 + f2 share a person; f3 has its own.
        let p1: String = conn.query_row("SELECT person_id FROM faces WHERE id='f1'", [], |r| r.get(0)).unwrap();
        let p2: String = conn.query_row("SELECT person_id FROM faces WHERE id='f2'", [], |r| r.get(0)).unwrap();
        let p3: String = conn.query_row("SELECT person_id FROM faces WHERE id='f3'", [], |r| r.get(0)).unwrap();
        assert_eq!(p1, p2);
        assert_ne!(p1, p3);

        // rep_face_id for the f1+f2 cluster picks the higher-confidence f1 (0.9 > 0.7).
        let rep_for_a: String = conn
            .query_row("SELECT rep_face_id FROM persons WHERE id=?1", params![p1], |r| r.get(0))
            .unwrap();
        assert_eq!(rep_for_a, "f1");
    }

    #[test]
    fn re_running_resets_auto_clusters() {
        let (d, mut conn) = setup();
        let dir = d.path().to_path_buf();
        let e1 = write_embedding(&dir, "f1", &[1.0, 0.0]);
        let e2 = write_embedding(&dir, "f2", &[0.0, 1.0]);
        seed_face(&conn, "f1", "p1", 0.9, &e1, 2);
        seed_face(&conn, "f2", "p2", 0.8, &e2, 2);

        let s1 = cluster_faces(&mut conn).unwrap();
        assert_eq!(s1.persons_created, 2);
        let s2 = cluster_faces(&mut conn).unwrap();
        assert_eq!(s2.persons_created, 2, "re-run should produce same number");
        let total: i64 = conn.query_row("SELECT COUNT(*) FROM persons", [], |r| r.get(0)).unwrap();
        assert_eq!(total, 2, "no person duplication after re-run");
    }

    #[test]
    fn faces_with_missing_embedding_files_are_skipped() {
        let (_d, mut conn) = setup();
        seed_face(&conn, "f-ghost", "p1", 0.9, "/does/not/exist.bin", 4);
        let summary = cluster_faces(&mut conn).unwrap();
        assert_eq!(summary.faces_loaded, 0, "ghost embedding should be skipped");
        assert_eq!(summary.persons_created, 0);
    }
}
