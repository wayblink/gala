use crate::library::models::{
    Album, FilterOptions, LibrarySource, LibrarySummary, SourceFolder, Tag, TimelinePhoto,
    UpsertedPhoto,
};
use crate::library::scanner::DiscoveredPhoto;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, Result as SqlResult, Row};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::Path;
use uuid::Uuid;

const SCHEMA_VERSION: i32 = 6;

const PHOTO_COLS: &str = "p.id, p.file_name, p.relative_path, p.file_mtime, p.file_size, \
    s.name, s.status, pa.thumbnail_medium_path, p.favorited_at, p.width, p.height, \
    p.captured_at, p.camera_make, p.camera_model, p.lens_model, p.gps_latitude, \
    p.gps_longitude, p.hidden_at";

const PHOTO_JOINS: &str = "FROM photos p \
    INNER JOIN sources s ON p.source_id = s.id \
    INNER JOIN photo_assets pa ON p.id = pa.photo_id";

const ASSET_READY_COND: &str =
    "pa.asset_status = 'ready' AND pa.thumbnail_medium_path IS NOT NULL";

pub fn open_database(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| format!("Failed to open database: {}", e))?;
    conn.execute_batch("PRAGMA journal_mode=WAL;")
        .map_err(|e| format!("Failed to set WAL: {}", e))?;
    Ok(conn)
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
            width INTEGER,
            height INTEGER,
            captured_at TEXT,
            camera_make TEXT,
            camera_model TEXT,
            lens_model TEXT,
            gps_latitude REAL,
            gps_longitude REAL,
            status TEXT NOT NULL,
            favorited_at TEXT,
            hidden_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(source_id, relative_path)
        );
        CREATE TABLE IF NOT EXISTS photo_assets (
            photo_id TEXT PRIMARY KEY REFERENCES photos(id),
            thumbnail_small_path TEXT,
            thumbnail_medium_path TEXT,
            thumbnail_large_path TEXT,
            asset_status TEXT NOT NULL,
            generated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS albums (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS album_photos (
            album_id TEXT NOT NULL REFERENCES albums(id),
            photo_id TEXT NOT NULL REFERENCES photos(id),
            added_at TEXT NOT NULL,
            PRIMARY KEY (album_id, photo_id)
        );
        CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS photo_tags (
            photo_id TEXT NOT NULL REFERENCES photos(id),
            tag_id TEXT NOT NULL REFERENCES tags(id),
            added_at TEXT NOT NULL,
            PRIMARY KEY (photo_id, tag_id)
        );
        "#,
    )
    .map_err(|e| format!("Failed to initialize schema: {}", e))?;

    let version: SqlResult<i32> =
        conn.query_row("SELECT version FROM schema_version", [], |row| row.get(0));
    if version.is_err() {
        conn.execute(
            "INSERT INTO schema_version (version) VALUES (?1)",
            params![SCHEMA_VERSION],
        )
        .map_err(|e| format!("Failed to set schema version: {}", e))?;
    }
    Ok(())
}

pub fn migrate_schema(conn: &Connection) -> Result<(), String> {
    let current_version: i32 = conn
        .query_row("SELECT version FROM schema_version", [], |row| row.get(0))
        .unwrap_or(1);

    add_column_if_missing(conn, "photos", "favorited_at", "TEXT")?;
    add_column_if_missing(conn, "photos", "hidden_at", "TEXT")?;
    add_column_if_missing(conn, "photos", "width", "INTEGER")?;
    add_column_if_missing(conn, "photos", "height", "INTEGER")?;
    add_column_if_missing(conn, "photos", "captured_at", "TEXT")?;
    add_column_if_missing(conn, "photos", "camera_make", "TEXT")?;
    add_column_if_missing(conn, "photos", "camera_model", "TEXT")?;
    add_column_if_missing(conn, "photos", "lens_model", "TEXT")?;
    add_column_if_missing(conn, "photos", "gps_latitude", "REAL")?;
    add_column_if_missing(conn, "photos", "gps_longitude", "REAL")?;

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS albums (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS album_photos (
            album_id TEXT NOT NULL REFERENCES albums(id),
            photo_id TEXT NOT NULL REFERENCES photos(id),
            added_at TEXT NOT NULL,
            PRIMARY KEY (album_id, photo_id)
        );
        CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS photo_tags (
            photo_id TEXT NOT NULL REFERENCES photos(id),
            tag_id TEXT NOT NULL REFERENCES tags(id),
            added_at TEXT NOT NULL,
            PRIMARY KEY (photo_id, tag_id)
        );
        "#,
    )
    .map_err(|e| format!("Failed to create new tables: {}", e))?;

    if current_version < SCHEMA_VERSION {
        conn.execute(
            "UPDATE schema_version SET version = ?1",
            params![SCHEMA_VERSION],
        )
        .map_err(|e| format!("Failed to update schema version: {}", e))?;
    }
    Ok(())
}

fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    col_type: &str,
) -> Result<(), String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({})", table))
        .map_err(|e| format!("Failed to inspect schema for {}: {}", table, e))?;

    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| format!("Failed to query schema for {}: {}", table, e))?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect schema for {}: {}", table, e))?;

    if columns.iter().any(|c| c == column) {
        return Ok(());
    }

    conn.execute(
        &format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, col_type),
        [],
    )
    .map_err(|e| format!("Failed to add column {}.{}: {}", table, column, e))?;

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
            "INSERT INTO sources (id, name, root_path, source_type, status, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
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

// Incremental upsert — preserves favorited_at and hidden_at, only reprocesses changed files
pub fn upsert_source_photos(
    conn: &mut Connection,
    source_id: &str,
    root_path: &Path,
    photos: &[DiscoveredPhoto],
) -> Result<Vec<UpsertedPhoto>, String> {
    // Load all existing photos for this source
    let existing: HashMap<String, (String, i64)> = {
        let mut stmt = conn
            .prepare("SELECT relative_path, id, file_mtime FROM photos WHERE source_id = ?1")
            .map_err(|e| format!("Failed to prepare existing-photos query: {}", e))?;
        let rows: Vec<(String, (String, i64))> = stmt.query_map(params![source_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                (row.get::<_, String>(1)?, row.get::<_, i64>(2)?),
            ))
        })
        .map_err(|e| format!("Failed to query existing photos: {}", e))?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect existing: {}", e))?;
        rows.into_iter().collect()
    };

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    let now = Utc::now().to_rfc3339();
    let mut result: Vec<UpsertedPhoto> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for photo in photos {
        let relative_path = photo
            .absolute_path
            .strip_prefix(root_path)
            .ok()
            .and_then(|p| p.to_str())
            .unwrap_or("")
            .to_string();
        let absolute_path_str = photo.absolute_path.to_str().unwrap_or("").to_string();
        seen.insert(relative_path.clone());

        if let Some((existing_id, existing_mtime)) = existing.get(&relative_path) {
            if *existing_mtime == photo.file_mtime {
                // Unchanged — skip unless thumbnail is missing
                let has_ready: bool = tx
                    .query_row(
                        "SELECT COUNT(*) FROM photo_assets WHERE photo_id = ?1 AND asset_status = 'ready'",
                        params![existing_id],
                        |row| row.get::<_, i64>(0),
                    )
                    .unwrap_or(0)
                    > 0;
                result.push(UpsertedPhoto {
                    id: existing_id.clone(),
                    absolute_path: absolute_path_str,
                    needs_thumbnail: !has_ready,
                });
            } else {
                // File changed — reset metadata and thumbnail
                tx.execute(
                    "UPDATE photos SET \
                        absolute_path_snapshot = ?1, file_size = ?2, file_mtime = ?3, \
                        status = 'indexed', captured_at = NULL, camera_make = NULL, \
                        camera_model = NULL, lens_model = NULL, \
                        gps_latitude = NULL, gps_longitude = NULL, \
                        width = NULL, height = NULL, updated_at = ?4 \
                     WHERE id = ?5",
                    params![absolute_path_str, photo.file_size as i64, photo.file_mtime, now, existing_id],
                )
                .map_err(|e| format!("Failed to update photo: {}", e))?;
                tx.execute("DELETE FROM photo_assets WHERE photo_id = ?1", params![existing_id])
                    .map_err(|e| format!("Failed to clear thumbnail: {}", e))?;
                result.push(UpsertedPhoto {
                    id: existing_id.clone(),
                    absolute_path: absolute_path_str,
                    needs_thumbnail: true,
                });
            }
        } else {
            // New photo
            let photo_id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO photos \
                    (id, source_id, relative_path, absolute_path_snapshot, file_name, \
                     extension, file_size, file_mtime, status, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    photo_id, source_id, relative_path, absolute_path_str,
                    photo.file_name, photo.extension,
                    photo.file_size as i64, photo.file_mtime,
                    "indexed", now, now
                ],
            )
            .map_err(|e| format!("Failed to insert photo: {}", e))?;
            result.push(UpsertedPhoto { id: photo_id, absolute_path: absolute_path_str, needs_thumbnail: true });
        }
    }

    // Remove photos that disappeared from disk
    for (relative_path, (photo_id, _)) in &existing {
        if !seen.contains(relative_path) {
            let _ = tx.execute("DELETE FROM album_photos WHERE photo_id = ?1", params![photo_id]);
            tx.execute("DELETE FROM photo_assets WHERE photo_id = ?1", params![photo_id])
                .map_err(|e| format!("Failed to delete photo assets: {}", e))?;
            tx.execute("DELETE FROM photos WHERE id = ?1", params![photo_id])
                .map_err(|e| format!("Failed to delete photo: {}", e))?;
        }
    }

    tx.commit().map_err(|e| format!("Failed to commit upsert: {}", e))?;
    Ok(result)
}

pub fn get_library_summary(conn: &Connection) -> Result<LibrarySummary, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, root_path, status FROM sources")
        .map_err(|e| format!("Failed to prepare sources query: {}", e))?;

    let sources: Vec<LibrarySource> = stmt
        .query_map([], |row| {
            let source_id: String = row.get(0)?;
            let photo_count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM photos WHERE source_id = ?1",
                    params![source_id],
                    |r| r.get(0),
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
    let recently_added_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM photos WHERE created_at >= datetime('now', '-7 days')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    let favorites_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM photos WHERE favorited_at IS NOT NULL AND hidden_at IS NULL",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    let hidden_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM photos WHERE hidden_at IS NOT NULL",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(LibrarySummary {
        sources,
        total_photos,
        recently_added_count,
        favorites_count,
        hidden_count,
    })
}

pub fn upsert_photo_assets(
    conn: &Connection,
    photo_id: &str,
    thumbnail_small: &str,
    thumbnail_medium: &str,
    thumbnail_large: &str,
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO photo_assets \
            (photo_id, thumbnail_small_path, thumbnail_medium_path, thumbnail_large_path, asset_status, generated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
         ON CONFLICT(photo_id) DO UPDATE SET \
            thumbnail_small_path = ?2, thumbnail_medium_path = ?3, thumbnail_large_path = ?4, \
            asset_status = ?5, generated_at = ?6",
        params![photo_id, thumbnail_small, thumbnail_medium, thumbnail_large, "ready", now],
    )
    .map_err(|e| format!("Failed to upsert photo assets: {}", e))?;
    Ok(())
}

pub fn mark_photo_assets_failed(conn: &Connection, photo_id: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO photo_assets (photo_id, asset_status) VALUES (?1, ?2) \
         ON CONFLICT(photo_id) DO UPDATE SET asset_status = ?2",
        params![photo_id, "failed"],
    )
    .map_err(|e| format!("Failed to mark photo assets as failed: {}", e))?;
    Ok(())
}

pub fn update_photo_dimensions(
    conn: &Connection,
    photo_id: &str,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE photos SET width = ?1, height = ?2, updated_at = ?3 WHERE id = ?4",
        params![width as i64, height as i64, now, photo_id],
    )
    .map_err(|e| format!("Failed to update photo dimensions: {}", e))?;
    Ok(())
}

pub fn update_photo_exif_metadata(
    conn: &Connection,
    photo_id: &str,
    captured_at: Option<&str>,
    camera_make: Option<&str>,
    camera_model: Option<&str>,
    lens_model: Option<&str>,
    gps_latitude: Option<f64>,
    gps_longitude: Option<f64>,
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE photos SET captured_at = ?1, camera_make = ?2, camera_model = ?3, \
            lens_model = ?4, gps_latitude = ?5, gps_longitude = ?6, updated_at = ?7 \
         WHERE id = ?8",
        params![captured_at, camera_make, camera_model, lens_model, gps_latitude, gps_longitude, now, photo_id],
    )
    .map_err(|e| format!("Failed to update EXIF: {}", e))?;
    Ok(())
}

fn normalize_relative_path(path: &str) -> String {
    path.replace('\\', "/").trim_matches('/').to_string()
}

fn folder_path_for_relative_path(relative_path: &str) -> String {
    let normalized = normalize_relative_path(relative_path);
    match normalized.rsplit_once('/') {
        Some((folder, _)) => folder.to_string(),
        None => String::new(),
    }
}

fn folder_name_for_path(source_name: &str, folder_path: &str) -> String {
    if folder_path.is_empty() {
        return source_name.to_string();
    }
    folder_path.rsplit('/').next().unwrap_or(folder_path).to_string()
}

pub fn get_source_folders(conn: &Connection) -> Result<Vec<SourceFolder>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.name, p.relative_path \
             FROM sources s INNER JOIN photos p ON p.source_id = s.id \
             WHERE p.status = 'indexed' \
             ORDER BY s.name COLLATE NOCASE ASC, p.relative_path COLLATE NOCASE ASC",
        )
        .map_err(|e| format!("Failed to prepare source folders query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
        })
        .map_err(|e| format!("Failed to query source folders: {}", e))?;

    let mut source_names: BTreeMap<String, String> = BTreeMap::new();
    let mut folder_counts: BTreeMap<(String, String), i64> = BTreeMap::new();

    for row in rows {
        let (source_id, source_name, relative_path) =
            row.map_err(|e| format!("Failed to read source folder row: {}", e))?;
        source_names.insert(source_id.clone(), source_name);
        *folder_counts.entry((source_id.clone(), String::new())).or_insert(0) += 1;
        let folder_path = folder_path_for_relative_path(&relative_path);
        if folder_path.is_empty() { continue; }
        let segments: Vec<&str> = folder_path.split('/').filter(|s| !s.is_empty()).collect();
        for depth in 1..=segments.len() {
            let ancestor = segments[..depth].join("/");
            *folder_counts.entry((source_id.clone(), ancestor)).or_insert(0) += 1;
        }
    }

    let mut folders: Vec<SourceFolder> = folder_counts
        .into_iter()
        .filter_map(|((source_id, folder_path), photo_count)| {
            source_names.get(&source_id).map(|sn| {
                let depth = if folder_path.is_empty() { 0 } else { folder_path.split('/').count() as i64 };
                SourceFolder {
                    id: format!("{}:{}", source_id, folder_path),
                    source_id,
                    name: folder_name_for_path(sn, &folder_path),
                    folder_path,
                    depth,
                    photo_count,
                }
            })
        })
        .collect();

    folders.sort_by(|a, b| {
        let na = source_names.get(&a.source_id).map(String::as_str).unwrap_or("");
        let nb = source_names.get(&b.source_id).map(String::as_str).unwrap_or("");
        na.cmp(nb).then_with(|| a.folder_path.cmp(&b.folder_path))
    });

    Ok(folders)
}

fn timeline_photo_from_row(row: &Row<'_>) -> SqlResult<TimelinePhoto> {
    let relative_path: String = row.get(2)?;
    let file_mtime: i64 = row.get(3)?;
    let captured_at: Option<String> = row.get(11)?;
    let captured_at = captured_at
        .or_else(|| DateTime::from_timestamp(file_mtime, 0).map(|d| d.to_rfc3339()));
    let folder_path = folder_path_for_relative_path(&relative_path);
    let favorited_at: Option<String> = row.get(8)?;
    let hidden_at: Option<String> = row.get(17)?;

    Ok(TimelinePhoto {
        id: row.get(0)?,
        file_name: row.get(1)?,
        relative_path,
        folder_path,
        captured_at,
        width: row.get(9)?,
        height: row.get(10)?,
        camera_make: row.get(12)?,
        camera_model: row.get(13)?,
        lens_model: row.get(14)?,
        gps_latitude: row.get(15)?,
        gps_longitude: row.get(16)?,
        file_size: row.get(4)?,
        source_name: row.get(5)?,
        source_status: row.get(6)?,
        thumbnail_path: row.get(7)?,
        is_favorite: favorited_at.is_some(),
        is_hidden: hidden_at.is_some(),
        tags: vec![],  // populated separately when needed
    })
}

pub fn get_photo_tags(conn: &Connection, photo_id: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.name FROM tags t \
              INNER JOIN photo_tags pt ON pt.tag_id = t.id \
              WHERE pt.photo_id = ?1 ORDER BY t.name COLLATE NOCASE",
        )
        .map_err(|e| format!("Failed to prepare get_photo_tags: {}", e))?;
    let tags = stmt
        .query_map(params![photo_id], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Failed to query photo tags: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect photo tags: {}", e))?;
    Ok(tags)
}

pub fn set_photo_tags(conn: &Connection, photo_id: &str, tags: &[String]) -> Result<Vec<String>, String> {
    let now = Utc::now().to_rfc3339();
    for tag in tags {
        let tag_name = tag.trim();
        if tag_name.is_empty() { continue; }
        let existing_id: Option<String> = conn
            .query_row("SELECT id FROM tags WHERE name = ?1 COLLATE NOCASE", params![tag_name], |r| r.get(0))
            .ok();
        let tag_id = if let Some(id) = existing_id {
            id
        } else {
            let id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO tags (id, name, created_at) VALUES (?1, ?2, ?3)",
                params![id, tag_name, now],
            )
            .map_err(|e| format!("Failed to insert tag: {}", e))?;
            id
        };
        conn.execute(
            "INSERT OR IGNORE INTO photo_tags (photo_id, tag_id, added_at) VALUES (?1, ?2, ?3)",
            params![photo_id, tag_id, now],
        )
        .map_err(|e| format!("Failed to link photo tag: {}", e))?;
    }

    // Remove tags not in the new list
    let normalized: Vec<String> = tags.iter().map(|t| t.trim().to_lowercase()).filter(|t| !t.is_empty()).collect();
    let current = get_photo_tags(conn, photo_id)?;
    for existing_tag in &current {
        if !normalized.contains(&existing_tag.to_lowercase()) {
            conn.execute(
                "DELETE FROM photo_tags WHERE photo_id = ?1 \
                 AND tag_id = (SELECT id FROM tags WHERE name = ?2 COLLATE NOCASE)",
                params![photo_id, existing_tag],
            )
            .map_err(|e| format!("Failed to remove photo tag: {}", e))?;
        }
    }

    get_photo_tags(conn, photo_id)
}

pub fn get_all_tags(conn: &Connection) -> Result<Vec<Tag>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.name, COUNT(pt.photo_id) as cnt \
              FROM tags t LEFT JOIN photo_tags pt ON pt.tag_id = t.id \
              GROUP BY t.id ORDER BY t.name COLLATE NOCASE",
        )
        .map_err(|e| format!("Failed to prepare get_all_tags: {}", e))?;
    let tags = stmt
        .query_map([], |row| Ok(Tag { name: row.get(0)?, photo_count: row.get(1)? }))
        .map_err(|e| format!("Failed to query tags: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect tags: {}", e))?;
    Ok(tags)
}

pub fn get_photos_by_tag(conn: &Connection, tag_name: &str, limit: i64, offset: i64) -> Result<Vec<TimelinePhoto>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {cols} {joins} \
              INNER JOIN photo_tags pt ON p.id = pt.photo_id \
              INNER JOIN tags t ON pt.tag_id = t.id \
              WHERE {asset} AND p.hidden_at IS NULL AND t.name = ?3 COLLATE NOCASE \
              ORDER BY COALESCE(strftime('%s', p.captured_at), p.file_mtime) DESC LIMIT ?1 OFFSET ?2",
            cols = PHOTO_COLS, joins = PHOTO_JOINS, asset = ASSET_READY_COND
        ))
        .map_err(|e| format!("Failed to prepare tag photos query: {}", e))?;
    let photos = stmt
        .query_map(params![limit, offset, tag_name], timeline_photo_from_row)
        .map_err(|e| format!("Failed to query tag photos: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect tag photos: {}", e))?;
    Ok(photos)
}

pub fn get_timeline_photos(
    conn: &Connection,
    limit: i64,
    offset: i64,
    source_id: Option<&str>,
    folder_path: Option<&str>,
) -> Result<Vec<TimelinePhoto>, String> {
    let normalized = folder_path.map(normalize_relative_path).filter(|p| !p.is_empty());
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {cols} {joins} \
             WHERE {asset} AND p.hidden_at IS NULL \
               AND (?3 IS NULL OR p.source_id = ?3) \
               AND (?4 IS NULL OR p.relative_path LIKE (?4 || '/%')) \
             ORDER BY COALESCE(strftime('%s', p.captured_at), p.file_mtime) DESC, p.file_mtime DESC \
             LIMIT ?1 OFFSET ?2",
            cols = PHOTO_COLS, joins = PHOTO_JOINS, asset = ASSET_READY_COND
        ))
        .map_err(|e| format!("Failed to prepare timeline query: {}", e))?;

    let photos = stmt
        .query_map(params![limit, offset, source_id, normalized], timeline_photo_from_row)
        .map_err(|e| format!("Failed to query timeline: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect timeline: {}", e))?;
    Ok(photos)
}

fn escaped_like_pattern(query: &str) -> String {
    let mut pattern = String::from("%");
    for ch in query.trim().chars() {
        match ch {
            '\\' | '%' | '_' => { pattern.push('\\'); pattern.push(ch); }
            _ => pattern.push(ch),
        }
    }
    pattern.push('%');
    pattern
}

pub fn search_photos(conn: &Connection, limit: i64, offset: i64, query: &str) -> Result<Vec<TimelinePhoto>, String> {
    if query.trim().is_empty() { return Ok(vec![]); }
    let pattern = escaped_like_pattern(query);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {cols} {joins} \
             WHERE {asset} AND p.hidden_at IS NULL \
               AND (p.file_name LIKE ?3 ESCAPE '\\' OR p.relative_path LIKE ?3 ESCAPE '\\' \
                 OR s.name LIKE ?3 ESCAPE '\\' OR date(p.file_mtime,'unixepoch') LIKE ?3 ESCAPE '\\' \
                 OR date(p.captured_at) LIKE ?3 ESCAPE '\\' \
                 OR p.camera_make LIKE ?3 ESCAPE '\\' OR p.camera_model LIKE ?3 ESCAPE '\\' \
                 OR p.lens_model LIKE ?3 ESCAPE '\\') \
             ORDER BY p.file_mtime DESC LIMIT ?1 OFFSET ?2",
            cols = PHOTO_COLS, joins = PHOTO_JOINS, asset = ASSET_READY_COND
        ))
        .map_err(|e| format!("Failed to prepare search query: {}", e))?;

    let photos = stmt
        .query_map(params![limit, offset, pattern], timeline_photo_from_row)
        .map_err(|e| format!("Failed to query search: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect search: {}", e))?;
    Ok(photos)
}

pub fn get_recently_added_photos(conn: &Connection, limit: i64, offset: i64) -> Result<Vec<TimelinePhoto>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {cols} {joins} \
             WHERE {asset} AND p.hidden_at IS NULL \
               AND p.created_at >= datetime('now', '-7 days') \
             ORDER BY p.created_at DESC LIMIT ?1 OFFSET ?2",
            cols = PHOTO_COLS, joins = PHOTO_JOINS, asset = ASSET_READY_COND
        ))
        .map_err(|e| format!("Failed to prepare recent query: {}", e))?;

    let photos = stmt
        .query_map(params![limit, offset], timeline_photo_from_row)
        .map_err(|e| format!("Failed to query recent: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect recent: {}", e))?;
    Ok(photos)
}

pub fn get_favorite_photos(conn: &Connection, limit: i64, offset: i64) -> Result<Vec<TimelinePhoto>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {cols} {joins} \
             WHERE {asset} AND p.hidden_at IS NULL AND p.favorited_at IS NOT NULL \
             ORDER BY p.favorited_at DESC LIMIT ?1 OFFSET ?2",
            cols = PHOTO_COLS, joins = PHOTO_JOINS, asset = ASSET_READY_COND
        ))
        .map_err(|e| format!("Failed to prepare favorites query: {}", e))?;

    let photos = stmt
        .query_map(params![limit, offset], timeline_photo_from_row)
        .map_err(|e| format!("Failed to query favorites: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect favorites: {}", e))?;
    Ok(photos)
}

pub fn get_hidden_photos(conn: &Connection, limit: i64, offset: i64) -> Result<Vec<TimelinePhoto>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {cols} {joins} \
             WHERE {asset} AND p.hidden_at IS NOT NULL \
             ORDER BY p.hidden_at DESC LIMIT ?1 OFFSET ?2",
            cols = PHOTO_COLS, joins = PHOTO_JOINS, asset = ASSET_READY_COND
        ))
        .map_err(|e| format!("Failed to prepare hidden query: {}", e))?;

    let photos = stmt
        .query_map(params![limit, offset], timeline_photo_from_row)
        .map_err(|e| format!("Failed to query hidden: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect hidden: {}", e))?;
    Ok(photos)
}

pub fn set_photo_favorite(conn: &Connection, photo_id: &str, favorited: bool) -> Result<bool, String> {
    let now = Utc::now().to_rfc3339();
    let favorited_at: Option<String> = if favorited { Some(now) } else { None };
    conn.execute("UPDATE photos SET favorited_at = ?1 WHERE id = ?2", params![favorited_at, photo_id])
        .map_err(|e| format!("Failed to update favorite: {}", e))?;
    Ok(favorited)
}

pub fn set_photo_hidden(conn: &Connection, photo_id: &str, hidden: bool) -> Result<bool, String> {
    let now = Utc::now().to_rfc3339();
    let hidden_at: Option<String> = if hidden { Some(now) } else { None };
    conn.execute("UPDATE photos SET hidden_at = ?1 WHERE id = ?2", params![hidden_at, photo_id])
        .map_err(|e| format!("Failed to update hidden: {}", e))?;
    Ok(hidden)
}

pub fn set_photos_favorite_batch(
    conn: &mut Connection,
    photo_ids: &[String],
    favorited: bool,
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    let value: Option<String> = if favorited { Some(now) } else { None };
    let tx = conn.transaction().map_err(|e| format!("Failed to start transaction: {}", e))?;
    for photo_id in photo_ids {
        tx.execute(
            "UPDATE photos SET favorited_at = ?1 WHERE id = ?2",
            params![value, photo_id],
        )
        .map_err(|e| format!("Failed to update favorite: {}", e))?;
    }
    tx.commit().map_err(|e| format!("Failed to commit favorite batch: {}", e))?;
    Ok(())
}

pub fn set_photos_hidden_batch(
    conn: &mut Connection,
    photo_ids: &[String],
    hidden: bool,
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    let value: Option<String> = if hidden { Some(now) } else { None };
    let tx = conn.transaction().map_err(|e| format!("Failed to start transaction: {}", e))?;
    for photo_id in photo_ids {
        tx.execute(
            "UPDATE photos SET hidden_at = ?1 WHERE id = ?2",
            params![value, photo_id],
        )
        .map_err(|e| format!("Failed to update hidden: {}", e))?;
    }
    tx.commit().map_err(|e| format!("Failed to commit hidden batch: {}", e))?;
    Ok(())
}

/// Add each tag in `tags` to every photo in `photo_ids` (idempotent — existing
/// links are skipped via INSERT OR IGNORE). Does not remove existing tags.
pub fn add_tags_to_photos_batch(
    conn: &mut Connection,
    photo_ids: &[String],
    tags: &[String],
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    let tx = conn.transaction().map_err(|e| format!("Failed to start transaction: {}", e))?;
    for tag in tags {
        let tag_name = tag.trim();
        if tag_name.is_empty() {
            continue;
        }
        let existing_id: Option<String> = tx
            .query_row(
                "SELECT id FROM tags WHERE name = ?1 COLLATE NOCASE",
                params![tag_name],
                |r| r.get(0),
            )
            .ok();
        let tag_id = if let Some(id) = existing_id {
            id
        } else {
            let id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO tags (id, name, created_at) VALUES (?1, ?2, ?3)",
                params![id, tag_name, now],
            )
            .map_err(|e| format!("Failed to insert tag: {}", e))?;
            id
        };
        for photo_id in photo_ids {
            tx.execute(
                "INSERT OR IGNORE INTO photo_tags (photo_id, tag_id, added_at) VALUES (?1, ?2, ?3)",
                params![photo_id, tag_id, now],
            )
            .map_err(|e| format!("Failed to link photo tag: {}", e))?;
        }
    }
    tx.commit().map_err(|e| format!("Failed to commit tag batch: {}", e))?;
    Ok(())
}

pub fn get_photo_original_path(conn: &Connection, photo_id: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT absolute_path_snapshot FROM photos WHERE id = ?1 AND status = 'indexed'",
        params![photo_id],
        |row| row.get(0),
    )
    .map_err(|e| format!("Failed to query photo path: {}", e))
}

pub fn get_filter_options(conn: &Connection) -> Result<FilterOptions, String> {
    let mut cam_stmt = conn
        .prepare(
            "SELECT DISTINCT NULLIF(TRIM(COALESCE(camera_make,'') || ' ' || COALESCE(camera_model,'')), '') \
             FROM photos WHERE hidden_at IS NULL ORDER BY 1 COLLATE NOCASE",
        )
        .map_err(|e| format!("Failed to prepare cameras query: {}", e))?;
    let cameras: Vec<String> = cam_stmt
        .query_map([], |row| row.get::<_, Option<String>>(0))
        .map_err(|e| format!("Failed to query cameras: {}", e))?
        .filter_map(|r| r.ok().flatten())
        .collect();

    let mut ext_stmt = conn
        .prepare("SELECT DISTINCT LOWER(extension) FROM photos WHERE hidden_at IS NULL ORDER BY 1")
        .map_err(|e| format!("Failed to prepare ext query: {}", e))?;
    let extensions: Vec<String> = ext_stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Failed to query extensions: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let date_min: Option<String> = conn
        .query_row(
            "SELECT date(MIN(COALESCE(captured_at, datetime(file_mtime,'unixepoch')))) FROM photos WHERE hidden_at IS NULL",
            [], |row| row.get(0),
        )
        .unwrap_or(None);
    let date_max: Option<String> = conn
        .query_row(
            "SELECT date(MAX(COALESCE(captured_at, datetime(file_mtime,'unixepoch')))) FROM photos WHERE hidden_at IS NULL",
            [], |row| row.get(0),
        )
        .unwrap_or(None);

    Ok(FilterOptions { cameras, extensions, date_min, date_max })
}

pub fn get_filtered_photos(
    conn: &Connection,
    limit: i64,
    offset: i64,
    source_id: Option<&str>,
    folder_path: Option<&str>,
    cameras: &[String],
    date_from: Option<&str>,
    date_to: Option<&str>,
    extensions: &[String],
) -> Result<Vec<TimelinePhoto>, String> {
    let mut where_parts: Vec<String> = vec![
        format!("{}", ASSET_READY_COND),
        "p.hidden_at IS NULL".to_string(),
    ];
    let mut pv: Vec<rusqlite::types::Value> = vec![];

    let normalized = folder_path.map(normalize_relative_path).filter(|p| !p.is_empty());

    if let Some(sid) = source_id {
        pv.push(rusqlite::types::Value::Text(sid.to_string()));
        where_parts.push(format!("p.source_id = ?{}", pv.len()));
    }
    if let Some(fp) = &normalized {
        pv.push(rusqlite::types::Value::Text(fp.clone()));
        where_parts.push(format!("p.relative_path LIKE (?{} || '/%')", pv.len()));
    }
    if !cameras.is_empty() {
        let phs: Vec<String> = cameras.iter().map(|c| {
            pv.push(rusqlite::types::Value::Text(c.clone()));
            format!("?{}", pv.len())
        }).collect();
        where_parts.push(format!(
            "NULLIF(TRIM(COALESCE(p.camera_make,'') || ' ' || COALESCE(p.camera_model,'')), '') IN ({})",
            phs.join(", ")
        ));
    }
    if let Some(df) = date_from {
        pv.push(rusqlite::types::Value::Text(df.to_string()));
        where_parts.push(format!(
            "COALESCE(date(p.captured_at), date(p.file_mtime,'unixepoch')) >= ?{}", pv.len()
        ));
    }
    if let Some(dt) = date_to {
        pv.push(rusqlite::types::Value::Text(dt.to_string()));
        where_parts.push(format!(
            "COALESCE(date(p.captured_at), date(p.file_mtime,'unixepoch')) <= ?{}", pv.len()
        ));
    }
    if !extensions.is_empty() {
        let phs: Vec<String> = extensions.iter().map(|e| {
            pv.push(rusqlite::types::Value::Text(e.to_lowercase()));
            format!("?{}", pv.len())
        }).collect();
        where_parts.push(format!("LOWER(p.extension) IN ({})", phs.join(", ")));
    }

    pv.push(rusqlite::types::Value::Integer(limit));
    let limit_idx = pv.len();
    pv.push(rusqlite::types::Value::Integer(offset));
    let offset_idx = pv.len();

    let sql = format!(
        "SELECT {cols} {joins} WHERE {where} \
         ORDER BY COALESCE(strftime('%s', p.captured_at), p.file_mtime) DESC, p.file_mtime DESC \
         LIMIT ?{limit_idx} OFFSET ?{offset_idx}",
        cols = PHOTO_COLS, joins = PHOTO_JOINS,
        where = where_parts.join(" AND "),
        limit_idx = limit_idx, offset_idx = offset_idx
    );

    let mut stmt = conn.prepare(&sql)
        .map_err(|e| format!("Failed to prepare filtered query: {}", e))?;
    let photos = stmt
        .query_map(rusqlite::params_from_iter(pv.iter()), timeline_photo_from_row)
        .map_err(|e| format!("Failed to query filtered: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect filtered: {}", e))?;
    Ok(photos)
}

// ─── Albums ────────────────────────────────────────────────────────────────────

pub fn create_album(conn: &Connection, name: &str) -> Result<Album, String> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO albums (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, name, now, now],
    )
    .map_err(|e| format!("Failed to create album: {}", e))?;
    Ok(Album { id, name: name.to_string(), photo_count: 0, created_at: now })
}

pub fn delete_album(conn: &Connection, album_id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM album_photos WHERE album_id = ?1", params![album_id])
        .map_err(|e| format!("Failed to delete album photos: {}", e))?;
    conn.execute("DELETE FROM albums WHERE id = ?1", params![album_id])
        .map_err(|e| format!("Failed to delete album: {}", e))?;
    Ok(())
}

pub fn rename_album(conn: &Connection, album_id: &str, new_name: &str) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE albums SET name = ?1, updated_at = ?2 WHERE id = ?3",
        params![new_name, now, album_id],
    )
    .map_err(|e| format!("Failed to rename album: {}", e))?;
    Ok(())
}

pub fn get_albums(conn: &Connection) -> Result<Vec<Album>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.name, a.created_at, \
                (SELECT COUNT(*) FROM album_photos ap WHERE ap.album_id = a.id) \
             FROM albums a ORDER BY a.name COLLATE NOCASE",
        )
        .map_err(|e| format!("Failed to prepare get_albums query: {}", e))?;
    let albums = stmt
        .query_map([], |row| Ok(Album {
            id: row.get(0)?,
            name: row.get(1)?,
            created_at: row.get(2)?,
            photo_count: row.get(3)?,
        }))
        .map_err(|e| format!("Failed to query albums: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect albums: {}", e))?;
    Ok(albums)
}

pub fn add_photo_to_album(conn: &Connection, album_id: &str, photo_id: &str) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO album_photos (album_id, photo_id, added_at) VALUES (?1, ?2, ?3)",
        params![album_id, photo_id, now],
    )
    .map_err(|e| format!("Failed to add photo to album: {}", e))?;
    Ok(())
}

pub fn remove_photo_from_album(conn: &Connection, album_id: &str, photo_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM album_photos WHERE album_id = ?1 AND photo_id = ?2",
        params![album_id, photo_id],
    )
    .map_err(|e| format!("Failed to remove photo from album: {}", e))?;
    Ok(())
}

pub fn add_photos_to_album_batch(conn: &mut Connection, album_id: &str, photo_ids: &[String]) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    let tx = conn.transaction().map_err(|e| format!("Failed to start transaction: {}", e))?;
    for photo_id in photo_ids {
        tx.execute(
            "INSERT OR IGNORE INTO album_photos (album_id, photo_id, added_at) VALUES (?1, ?2, ?3)",
            params![album_id, photo_id, now],
        )
        .map_err(|e| format!("Failed to add photo to album: {}", e))?;
    }
    tx.commit().map_err(|e| format!("Failed to commit batch: {}", e))?;
    Ok(())
}

pub fn remove_photos_from_album_batch(conn: &mut Connection, album_id: &str, photo_ids: &[String]) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| format!("Failed to start transaction: {}", e))?;
    for photo_id in photo_ids {
        tx.execute(
            "DELETE FROM album_photos WHERE album_id = ?1 AND photo_id = ?2",
            params![album_id, photo_id],
        )
        .map_err(|e| format!("Failed to remove photo from album: {}", e))?;
    }
    tx.commit().map_err(|e| format!("Failed to commit batch: {}", e))?;
    Ok(())
}

/// Delete a source and all dependent rows (album_photos, photo_tags,
/// photo_assets, photos). Caller is responsible for any on-disk cleanup
/// (thumbnails directory) after this returns.
pub fn delete_source(conn: &mut Connection, source_id: &str) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| format!("Failed to start transaction: {}", e))?;
    tx.execute(
        "DELETE FROM album_photos WHERE photo_id IN (SELECT id FROM photos WHERE source_id = ?1)",
        params![source_id],
    )
    .map_err(|e| format!("Failed to delete album_photos for source: {}", e))?;
    tx.execute(
        "DELETE FROM photo_tags WHERE photo_id IN (SELECT id FROM photos WHERE source_id = ?1)",
        params![source_id],
    )
    .map_err(|e| format!("Failed to delete photo_tags for source: {}", e))?;
    tx.execute(
        "DELETE FROM photo_assets WHERE photo_id IN (SELECT id FROM photos WHERE source_id = ?1)",
        params![source_id],
    )
    .map_err(|e| format!("Failed to delete photo_assets for source: {}", e))?;
    tx.execute("DELETE FROM photos WHERE source_id = ?1", params![source_id])
        .map_err(|e| format!("Failed to delete photos for source: {}", e))?;
    tx.execute("DELETE FROM sources WHERE id = ?1", params![source_id])
        .map_err(|e| format!("Failed to delete source: {}", e))?;
    tx.commit().map_err(|e| format!("Failed to commit source deletion: {}", e))?;
    Ok(())
}

pub fn get_album_photos(conn: &Connection, album_id: &str, limit: i64, offset: i64) -> Result<Vec<TimelinePhoto>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {cols} \
             FROM photos p \
             INNER JOIN sources s ON p.source_id = s.id \
             INNER JOIN photo_assets pa ON p.id = pa.photo_id \
             INNER JOIN album_photos ap ON p.id = ap.photo_id \
             WHERE {asset} AND p.hidden_at IS NULL AND ap.album_id = ?3 \
             ORDER BY ap.added_at DESC LIMIT ?1 OFFSET ?2",
            cols = PHOTO_COLS, asset = ASSET_READY_COND
        ))
        .map_err(|e| format!("Failed to prepare album photos query: {}", e))?;
    let photos = stmt
        .query_map(params![limit, offset, album_id], timeline_photo_from_row)
        .map_err(|e| format!("Failed to query album photos: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect album photos: {}", e))?;
    Ok(photos)
}
