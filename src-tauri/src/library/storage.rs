use crate::library::models::{LibrarySource, LibrarySummary};
use crate::library::scanner::DiscoveredPhoto;
use chrono::Utc;
use rusqlite::{params, Connection, Result as SqlResult};
use std::path::Path;
use uuid::Uuid;

const SCHEMA_VERSION: i32 = 1;

pub fn open_database(path: &Path) -> Result<Connection, String> {
    Connection::open(path).map_err(|e| format!("Failed to open database: {}", e))
}

pub fn initialize_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        );

        CREATE TABLE IF NOT EXISTS sources (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            root_path TEXT NOT NULL UNIQUE,
            source_type TEXT NOT NULL,
            status TEXT NOT NULL,
            last_scan_started_at TEXT,
            last_scan_completed_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS photos (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL REFERENCES sources(id),
            relative_path TEXT NOT NULL,
            absolute_path_snapshot TEXT NOT NULL,
            file_name TEXT NOT NULL,
            extension TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            file_mtime INTEGER NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(source_id, relative_path)
        );
        "#,
    )
    .map_err(|e| format!("Failed to initialize schema: {}", e))?;

    let version: SqlResult<i32> = conn.query_row("SELECT version FROM schema_version", [], |row| row.get(0));

    if version.is_err() {
        conn.execute("INSERT INTO schema_version (version) VALUES (?1)", params![SCHEMA_VERSION])
            .map_err(|e| format!("Failed to set schema version: {}", e))?;
    }

    Ok(())
}

pub fn upsert_source(conn: &Connection, root_path: &Path) -> Result<LibrarySource, String> {
    let root_path_str = root_path
        .to_str()
        .ok_or_else(|| "Invalid root path".to_string())?;

    let name = root_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let existing: SqlResult<String> = conn.query_row(
        "SELECT id FROM sources WHERE root_path = ?1",
        params![root_path_str],
        |row| row.get(0),
    );

    let now = Utc::now().to_rfc3339();

    let source_id = if let Ok(id) = existing {
        conn.execute(
            "UPDATE sources SET updated_at = ?1, status = ?2 WHERE id = ?3",
            params![now, "online", id],
        )
        .map_err(|e| format!("Failed to update source: {}", e))?;
        id
    } else {
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO sources (id, name, root_path, source_type, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, name, root_path_str, "local_folder", "online", now, now],
        )
        .map_err(|e| format!("Failed to insert source: {}", e))?;
        id
    };

    let photo_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM photos WHERE source_id = ?1",
            params![source_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(LibrarySource {
        id: source_id,
        name,
        root_path: root_path_str.to_string(),
        status: "online".to_string(),
        photo_count,
    })
}

pub fn replace_source_photos(
    conn: &mut Connection,
    source_id: &str,
    root_path: &Path,
    photos: &[DiscoveredPhoto],
) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    tx.execute("DELETE FROM photos WHERE source_id = ?1", params![source_id])
        .map_err(|e| format!("Failed to delete old photos: {}", e))?;

    let now = Utc::now().to_rfc3339();

    for photo in photos {
        let photo_id = Uuid::new_v4().to_string();
        let relative_path = photo
            .absolute_path
            .strip_prefix(root_path)
            .ok()
            .and_then(|p| p.to_str())
            .unwrap_or("");

        let absolute_path_str = photo
            .absolute_path
            .to_str()
            .ok_or_else(|| "Invalid photo path".to_string())?;

        tx.execute(
            "INSERT INTO photos (id, source_id, relative_path, absolute_path_snapshot, file_name, extension, file_size, file_mtime, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                photo_id,
                source_id,
                relative_path,
                absolute_path_str,
                photo.file_name,
                photo.extension,
                photo.file_size as i64,
                photo.file_mtime,
                "indexed",
                now,
                now
            ],
        )
        .map_err(|e| format!("Failed to insert photo: {}", e))?;
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit transaction: {}", e))?;

    Ok(())
}

pub fn get_library_summary(conn: &Connection) -> Result<LibrarySummary, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, root_path, status FROM sources")
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let sources: Vec<LibrarySource> = stmt
        .query_map([], |row| {
            let source_id: String = row.get(0)?;
            let photo_count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM photos WHERE source_id = ?1",
                    params![source_id],
                    |row| row.get(0),
                )
                .unwrap_or(0);

            Ok(LibrarySource {
                id: source_id,
                name: row.get(1)?,
                root_path: row.get(2)?,
                status: row.get(3)?,
                photo_count,
            })
        })
        .map_err(|e| format!("Failed to query sources: {}", e))?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect sources: {}", e))?;

    let total_photos: i64 = conn
        .query_row("SELECT COUNT(*) FROM photos", [], |row| row.get(0))
        .unwrap_or(0);

    Ok(LibrarySummary {
        sources,
        total_photos,
    })
}
