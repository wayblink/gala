use crate::library::models::{LibrarySource, LibrarySummary, SourceFolder, TimelinePhoto};
use crate::library::scanner::DiscoveredPhoto;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, Result as SqlResult, Row};
use std::collections::BTreeMap;
use std::path::Path;
use uuid::Uuid;

const SCHEMA_VERSION: i32 = 4;

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
    add_column_if_missing(conn, "photos", "width", "INTEGER")?;
    add_column_if_missing(conn, "photos", "height", "INTEGER")?;
    add_column_if_missing(conn, "photos", "captured_at", "TEXT")?;
    add_column_if_missing(conn, "photos", "camera_make", "TEXT")?;
    add_column_if_missing(conn, "photos", "camera_model", "TEXT")?;
    add_column_if_missing(conn, "photos", "lens_model", "TEXT")?;
    add_column_if_missing(conn, "photos", "gps_latitude", "REAL")?;
    add_column_if_missing(conn, "photos", "gps_longitude", "REAL")?;

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
    table_name: &str,
    column_name: &str,
    column_type: &str,
) -> Result<(), String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({})", table_name))
        .map_err(|e| format!("Failed to inspect schema for {}: {}", table_name, e))?;

    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| format!("Failed to query schema for {}: {}", table_name, e))?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect schema for {}: {}", table_name, e))?;

    if columns.iter().any(|column| column == column_name) {
        return Ok(());
    }

    conn.execute(
        &format!(
            "ALTER TABLE {} ADD COLUMN {} {}",
            table_name, column_name, column_type
        ),
        [],
    )
    .map_err(|e| format!("Failed to add column {}.{}: {}", table_name, column_name, e))?;

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

    // Delete photo_assets first to avoid foreign key constraint
    tx.execute(
        "DELETE FROM photo_assets WHERE photo_id IN (SELECT id FROM photos WHERE source_id = ?1)",
        params![source_id],
    )
    .map_err(|e| format!("Failed to delete old photo assets: {}", e))?;

    tx.execute(
        "DELETE FROM photos WHERE source_id = ?1",
        params![source_id],
    )
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

    let recently_added_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM photos WHERE created_at >= datetime('now', '-7 days')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let favorites_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM photos WHERE favorited_at IS NOT NULL",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(LibrarySummary {
        sources,
        total_photos,
        recently_added_count,
        favorites_count,
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
        "INSERT INTO photo_assets (photo_id, thumbnail_small_path, thumbnail_medium_path, thumbnail_large_path, asset_status, generated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(photo_id) DO UPDATE SET
            thumbnail_small_path = ?2,
            thumbnail_medium_path = ?3,
            thumbnail_large_path = ?4,
            asset_status = ?5,
            generated_at = ?6",
        params![photo_id, thumbnail_small, thumbnail_medium, thumbnail_large, "ready", now],
    )
    .map_err(|e| format!("Failed to upsert photo assets: {}", e))?;

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

    folder_path
        .rsplit('/')
        .next()
        .unwrap_or(folder_path)
        .to_string()
}

pub fn get_source_folders(conn: &Connection) -> Result<Vec<SourceFolder>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.name, p.relative_path
             FROM sources s
             INNER JOIN photos p ON p.source_id = s.id
             WHERE p.status = 'indexed'
             ORDER BY s.name COLLATE NOCASE ASC, p.relative_path COLLATE NOCASE ASC",
        )
        .map_err(|e| format!("Failed to prepare source folders query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| format!("Failed to query source folders: {}", e))?;

    let mut source_names: BTreeMap<String, String> = BTreeMap::new();
    let mut folder_counts: BTreeMap<(String, String), i64> = BTreeMap::new();

    for row in rows {
        let (source_id, source_name, relative_path) =
            row.map_err(|e| format!("Failed to collect source folder row: {}", e))?;
        source_names.insert(source_id.clone(), source_name);

        *folder_counts
            .entry((source_id.clone(), String::new()))
            .or_insert(0) += 1;

        let folder_path = folder_path_for_relative_path(&relative_path);
        if folder_path.is_empty() {
            continue;
        }

        let segments: Vec<&str> = folder_path
            .split('/')
            .filter(|segment| !segment.is_empty())
            .collect();
        for depth in 1..=segments.len() {
            let ancestor = segments[..depth].join("/");
            *folder_counts
                .entry((source_id.clone(), ancestor))
                .or_insert(0) += 1;
        }
    }

    let mut folders: Vec<SourceFolder> = folder_counts
        .into_iter()
        .filter_map(|((source_id, folder_path), photo_count)| {
            source_names.get(&source_id).map(|source_name| {
                let depth = if folder_path.is_empty() {
                    0
                } else {
                    folder_path.split('/').count() as i64
                };

                SourceFolder {
                    id: format!("{}:{}", source_id, folder_path),
                    source_id,
                    name: folder_name_for_path(source_name, &folder_path),
                    folder_path,
                    depth,
                    photo_count,
                }
            })
        })
        .collect();

    folders.sort_by(|a, b| {
        let source_name_a = source_names
            .get(&a.source_id)
            .map(String::as_str)
            .unwrap_or("");
        let source_name_b = source_names
            .get(&b.source_id)
            .map(String::as_str)
            .unwrap_or("");

        source_name_a
            .cmp(source_name_b)
            .then_with(|| a.folder_path.cmp(&b.folder_path))
    });

    Ok(folders)
}

pub fn mark_photo_assets_failed(conn: &Connection, photo_id: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO photo_assets (photo_id, asset_status)
         VALUES (?1, ?2)
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
        "UPDATE photos
         SET captured_at = ?1,
             camera_make = ?2,
             camera_model = ?3,
             lens_model = ?4,
             gps_latitude = ?5,
             gps_longitude = ?6,
             updated_at = ?7
         WHERE id = ?8",
        params![
            captured_at,
            camera_make,
            camera_model,
            lens_model,
            gps_latitude,
            gps_longitude,
            now,
            photo_id
        ],
    )
    .map_err(|e| format!("Failed to update photo EXIF metadata: {}", e))?;

    Ok(())
}

fn timeline_photo_from_row(row: &Row<'_>) -> SqlResult<TimelinePhoto> {
    let relative_path: String = row.get(2)?;
    let file_mtime: i64 = row.get(3)?;
    let captured_at: Option<String> = row.get(11)?;
    let captured_at = captured_at
        .or_else(|| DateTime::from_timestamp(file_mtime, 0).map(|date| date.to_rfc3339()));
    let folder_path = folder_path_for_relative_path(&relative_path);
    let favorited_at: Option<String> = row.get(8)?;

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
    })
}

pub fn get_timeline_photos(
    conn: &Connection,
    limit: i64,
    offset: i64,
    source_id: Option<&str>,
    folder_path: Option<&str>,
) -> Result<Vec<TimelinePhoto>, String> {
    let normalized_folder_path = folder_path
        .map(normalize_relative_path)
        .filter(|path| !path.is_empty());

    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.file_name, p.relative_path, p.file_mtime, p.file_size, s.name, s.status, pa.thumbnail_medium_path, p.favorited_at, p.width, p.height, p.captured_at, p.camera_make, p.camera_model, p.lens_model, p.gps_latitude, p.gps_longitude
             FROM photos p
             INNER JOIN sources s ON p.source_id = s.id
             INNER JOIN photo_assets pa ON p.id = pa.photo_id
             WHERE pa.asset_status = 'ready'
               AND pa.thumbnail_medium_path IS NOT NULL
               AND (?3 IS NULL OR p.source_id = ?3)
               AND (?4 IS NULL OR p.relative_path LIKE (?4 || '/%'))
             ORDER BY p.file_mtime DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let photos = stmt
        .query_map(
            params![limit, offset, source_id, normalized_folder_path],
            timeline_photo_from_row,
        )
        .map_err(|e| format!("Failed to query photos: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect photos: {}", e))?;

    Ok(photos)
}

fn escaped_like_pattern(query: &str) -> String {
    let mut pattern = String::from("%");
    for character in query.trim().chars() {
        match character {
            '\\' | '%' | '_' => {
                pattern.push('\\');
                pattern.push(character);
            }
            _ => pattern.push(character),
        }
    }
    pattern.push('%');
    pattern
}

pub fn search_photos(
    conn: &Connection,
    limit: i64,
    offset: i64,
    query: &str,
) -> Result<Vec<TimelinePhoto>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }

    let pattern = escaped_like_pattern(query);
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.file_name, p.relative_path, p.file_mtime, p.file_size, s.name, s.status, pa.thumbnail_medium_path, p.favorited_at, p.width, p.height, p.captured_at, p.camera_make, p.camera_model, p.lens_model, p.gps_latitude, p.gps_longitude
             FROM photos p
             INNER JOIN sources s ON p.source_id = s.id
             INNER JOIN photo_assets pa ON p.id = pa.photo_id
             WHERE pa.asset_status = 'ready'
               AND pa.thumbnail_medium_path IS NOT NULL
               AND (
                    p.file_name LIKE ?3 ESCAPE '\\'
                 OR p.relative_path LIKE ?3 ESCAPE '\\'
                 OR s.name LIKE ?3 ESCAPE '\\'
                 OR date(p.file_mtime, 'unixepoch') LIKE ?3 ESCAPE '\\'
                 OR datetime(p.file_mtime, 'unixepoch') LIKE ?3 ESCAPE '\\'
                 OR date(p.captured_at) LIKE ?3 ESCAPE '\\'
                 OR p.camera_make LIKE ?3 ESCAPE '\\'
                 OR p.camera_model LIKE ?3 ESCAPE '\\'
                 OR p.lens_model LIKE ?3 ESCAPE '\\'
               )
             ORDER BY p.file_mtime DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| format!("Failed to prepare search photos query: {}", e))?;

    let photos = stmt
        .query_map(params![limit, offset, pattern], timeline_photo_from_row)
        .map_err(|e| format!("Failed to query searched photos: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect searched photos: {}", e))?;

    Ok(photos)
}

pub fn get_photo_original_path(conn: &Connection, photo_id: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT absolute_path_snapshot FROM photos WHERE id = ?1 AND status = 'indexed'",
        params![photo_id],
        |row| row.get(0),
    )
    .map_err(|e| format!("Failed to query photo path: {}", e))
}

pub fn get_recently_added_photos(
    conn: &Connection,
    limit: i64,
    offset: i64,
) -> Result<Vec<TimelinePhoto>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.file_name, p.relative_path, p.file_mtime, p.file_size, s.name, s.status, pa.thumbnail_medium_path, p.favorited_at, p.width, p.height, p.captured_at, p.camera_make, p.camera_model, p.lens_model, p.gps_latitude, p.gps_longitude
             FROM photos p
             INNER JOIN sources s ON p.source_id = s.id
             INNER JOIN photo_assets pa ON p.id = pa.photo_id
             WHERE pa.asset_status = 'ready'
               AND pa.thumbnail_medium_path IS NOT NULL
               AND p.created_at >= datetime('now', '-7 days')
             ORDER BY p.created_at DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| format!("Failed to prepare recent photos query: {}", e))?;

    let photos = stmt
        .query_map(params![limit, offset], timeline_photo_from_row)
        .map_err(|e| format!("Failed to query recent photos: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect recent photos: {}", e))?;

    Ok(photos)
}

pub fn get_favorite_photos(
    conn: &Connection,
    limit: i64,
    offset: i64,
) -> Result<Vec<TimelinePhoto>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.file_name, p.relative_path, p.file_mtime, p.file_size, s.name, s.status, pa.thumbnail_medium_path, p.favorited_at, p.width, p.height, p.captured_at, p.camera_make, p.camera_model, p.lens_model, p.gps_latitude, p.gps_longitude
             FROM photos p
             INNER JOIN sources s ON p.source_id = s.id
             INNER JOIN photo_assets pa ON p.id = pa.photo_id
             WHERE pa.asset_status = 'ready'
               AND pa.thumbnail_medium_path IS NOT NULL
               AND p.favorited_at IS NOT NULL
             ORDER BY p.favorited_at DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| format!("Failed to prepare favorite photos query: {}", e))?;

    let photos = stmt
        .query_map(params![limit, offset], timeline_photo_from_row)
        .map_err(|e| format!("Failed to query favorite photos: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect favorite photos: {}", e))?;

    Ok(photos)
}

pub fn set_photo_favorite(
    conn: &Connection,
    photo_id: &str,
    favorited: bool,
) -> Result<bool, String> {
    let now = Utc::now().to_rfc3339();
    let favorited_at: Option<&str> = if favorited { Some(&now) } else { None };

    conn.execute(
        "UPDATE photos SET favorited_at = ?1 WHERE id = ?2",
        params![favorited_at, photo_id],
    )
    .map_err(|e| format!("Failed to update favorite status: {}", e))?;

    Ok(favorited)
}
