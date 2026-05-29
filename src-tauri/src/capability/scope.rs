//! Scope resolution: AnalysisRequest.scope_kind/scope_id -> Vec<AnalyzeInput>.
//!
//! The capability layer is intentionally photo-blind: it only receives a
//! flat list of inputs with absolute paths. Knowing how to expand a scope
//! into that list belongs to the library layer, which owns the photos /
//! sources tables.

use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};

use crate::capability::{AnalyzeInput, CapabilityError, ScopeKind};

/// Resolves a request scope to a flat list of inputs the orchestrator can
/// consume. Photos that fail to resolve (missing thumbnail / source row)
/// are still emitted with whatever fields are available; the provider is
/// responsible for surfacing per-photo errors.
pub fn resolve_scope(
    conn: &Connection,
    scope: ScopeKind,
    scope_id: Option<&str>,
) -> Result<Vec<AnalyzeInput>, CapabilityError> {
    match scope {
        ScopeKind::Photo => {
            let id = scope_id.ok_or_else(|| {
                CapabilityError::InvalidInput("scope=photo requires scope_id".into())
            })?;
            let row = fetch_one(conn, id)?;
            Ok(row.into_iter().collect())
        }
        ScopeKind::Source => {
            let id = scope_id.ok_or_else(|| {
                CapabilityError::InvalidInput("scope=source requires scope_id".into())
            })?;
            fetch_by_source(conn, id)
        }
        ScopeKind::All => fetch_all(conn),
    }
}

fn fetch_one(conn: &Connection, photo_id: &str) -> Result<Option<AnalyzeInput>, CapabilityError> {
    use rusqlite::OptionalExtension;
    conn.query_row(
        "SELECT p.id, s.root_path, p.relative_path, pa.thumbnail_medium_path, p.width, p.height \
         FROM photos p \
         INNER JOIN sources s ON p.source_id = s.id \
         LEFT JOIN photo_assets pa ON pa.photo_id = p.id \
         WHERE p.id = ?1",
        params![photo_id],
        |row| Ok(map_row(row)),
    )
    .optional()
    .map_err(CapabilityError::from)
}

fn fetch_by_source(
    conn: &Connection,
    source_id: &str,
) -> Result<Vec<AnalyzeInput>, CapabilityError> {
    let mut stmt = conn.prepare(
        "SELECT p.id, s.root_path, p.relative_path, pa.thumbnail_medium_path, p.width, p.height \
         FROM photos p \
         INNER JOIN sources s ON p.source_id = s.id \
         LEFT JOIN photo_assets pa ON pa.photo_id = p.id \
         WHERE p.source_id = ?1 AND p.status = 'indexed' \
         ORDER BY p.captured_at",
    )?;
    let rows = stmt
        .query_map(params![source_id], |row| Ok(map_row(row)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn fetch_all(conn: &Connection) -> Result<Vec<AnalyzeInput>, CapabilityError> {
    let mut stmt = conn.prepare(
        "SELECT p.id, s.root_path, p.relative_path, pa.thumbnail_medium_path, p.width, p.height \
         FROM photos p \
         INNER JOIN sources s ON p.source_id = s.id \
         LEFT JOIN photo_assets pa ON pa.photo_id = p.id \
         WHERE p.status = 'indexed' \
         ORDER BY p.captured_at",
    )?;
    let rows = stmt
        .query_map([], |row| Ok(map_row(row)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn map_row(row: &rusqlite::Row<'_>) -> AnalyzeInput {
    let photo_id: String = row.get(0).unwrap_or_default();
    let root_path: String = row.get(1).unwrap_or_default();
    let relative_path: String = row.get(2).unwrap_or_default();
    let thumbnail_path: Option<String> = row.get(3).ok();
    let width: Option<i64> = row.get(4).ok();
    let height: Option<i64> = row.get(5).ok();

    let absolute = if relative_path.is_empty() {
        PathBuf::from(&root_path)
    } else {
        Path::new(&root_path).join(&relative_path)
    };

    AnalyzeInput {
        photo_id,
        image_path: absolute,
        thumbnail_path: thumbnail_path.map(PathBuf::from),
        hint_dimensions: match (width, height) {
            (Some(w), Some(h)) if w > 0 && h > 0 => Some((w as u32, h as u32)),
            _ => None,
        },
        meta: serde_json::Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::storage::{initialize_schema, open_database};
    use rusqlite::params;
    use tempfile::TempDir;

    fn seed_db(photo_count: usize) -> (TempDir, Connection) {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("test.db");
        let conn = open_database(&path).expect("open db");
        initialize_schema(&conn).expect("init schema");
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO sources (id, name, root_path, source_type, status, created_at, updated_at) \
             VALUES ('src-1', 'Test', '/photos', 'local', 'online', ?1, ?1)",
            params![now],
        )
        .unwrap();
        for i in 0..photo_count {
            let pid = format!("photo-{}", i);
            let rel = format!("{}.jpg", i);
            conn.execute(
                "INSERT INTO photos (id, source_id, relative_path, absolute_path_snapshot, file_name, \
                 extension, file_size, file_mtime, status, created_at, updated_at) \
                 VALUES (?1, 'src-1', ?2, ?3, ?4, 'jpg', 1024, 0, 'indexed', ?5, ?5)",
                params![pid, rel, format!("/photos/{}", rel), rel, now],
            )
            .unwrap();
        }
        (dir, conn)
    }

    #[test]
    fn scope_photo_returns_single_input() {
        let (_dir, conn) = seed_db(3);
        let out = resolve_scope(&conn, ScopeKind::Photo, Some("photo-1")).unwrap();
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].photo_id, "photo-1");
        assert_eq!(out[0].image_path, PathBuf::from("/photos/1.jpg"));
    }

    #[test]
    fn scope_photo_unknown_returns_empty() {
        let (_dir, conn) = seed_db(1);
        let out = resolve_scope(&conn, ScopeKind::Photo, Some("ghost")).unwrap();
        assert_eq!(out.len(), 0);
    }

    #[test]
    fn scope_photo_without_id_errors() {
        let (_dir, conn) = seed_db(1);
        let err = resolve_scope(&conn, ScopeKind::Photo, None).unwrap_err();
        match err {
            CapabilityError::InvalidInput(_) => {}
            other => panic!("expected InvalidInput, got {:?}", other),
        }
    }

    #[test]
    fn scope_source_returns_all_source_photos() {
        let (_dir, conn) = seed_db(5);
        let out = resolve_scope(&conn, ScopeKind::Source, Some("src-1")).unwrap();
        assert_eq!(out.len(), 5);
    }

    #[test]
    fn scope_all_returns_indexed_photos() {
        let (_dir, conn) = seed_db(4);
        let out = resolve_scope(&conn, ScopeKind::All, None).unwrap();
        assert_eq!(out.len(), 4);
        let ids: Vec<_> = out.iter().map(|i| i.photo_id.clone()).collect();
        assert!(ids.contains(&"photo-0".to_string()));
        assert!(ids.contains(&"photo-3".to_string()));
    }
}
