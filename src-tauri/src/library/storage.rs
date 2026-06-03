use crate::library::models::{
    Album, FilterOptions, Label, LibrarySource, LibrarySummary, SourceFolder, Tag, TimelinePhoto,
    UpsertedPhoto,
};
use crate::library::scanner::DiscoveredPhoto;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, Result as SqlResult, Row};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::Path;
use uuid::Uuid;

const SCHEMA_VERSION: i32 = 13;

const PHOTO_COLS: &str = "p.id, p.file_name, p.relative_path, p.file_mtime, p.file_size, \
    s.name, s.status, pa.thumbnail_medium_path, p.favorited_at, p.width, p.height, \
    p.captured_at, p.camera_make, p.camera_model, p.lens_model, p.gps_latitude, \
    p.gps_longitude, p.hidden_at";

const PHOTO_JOINS: &str = "FROM photos p \
    INNER JOIN sources s ON p.source_id = s.id \
    INNER JOIN photo_assets pa ON p.id = pa.photo_id";

const ASSET_READY_COND: &str = "pa.asset_status = 'ready' AND pa.thumbnail_medium_path IS NOT NULL";

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
            content_hash TEXT,
            fingerprint TEXT NOT NULL DEFAULT '',
            logical_id TEXT,
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
            name TEXT NOT NULL COLLATE NOCASE,
            canonical_name TEXT,
            semantic_key TEXT,
            kind TEXT NOT NULL DEFAULT 'manual',
            visibility TEXT NOT NULL DEFAULT 'user',
            created_by TEXT NOT NULL DEFAULT 'user',
            created_at TEXT NOT NULL,
            updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS photo_tags (
            photo_id TEXT NOT NULL REFERENCES photos(id),
            tag_id TEXT NOT NULL REFERENCES tags(id),
            added_at TEXT NOT NULL,
            PRIMARY KEY (photo_id, tag_id)
        );
        CREATE TABLE IF NOT EXISTS photo_tag_sources (
            photo_id TEXT NOT NULL REFERENCES photos(id),
            tag_id TEXT NOT NULL REFERENCES tags(id),
            source TEXT NOT NULL,
            confidence REAL,
            evidence_json TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            added_at TEXT NOT NULL,
            updated_at TEXT,
            PRIMARY KEY (photo_id, tag_id, source)
        );
        CREATE TABLE IF NOT EXISTS analysis_jobs (
            id TEXT PRIMARY KEY,
            capability TEXT NOT NULL,
            provider_id TEXT NOT NULL,
            schema_version INTEGER NOT NULL,
            scope_kind TEXT NOT NULL,
            scope_id TEXT,
            status TEXT NOT NULL,
            priority INTEGER NOT NULL DEFAULT 0,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            parent_job_id TEXT REFERENCES analysis_jobs(id),
            config_json TEXT,
            started_at TEXT,
            completed_at TEXT,
            photos_total INTEGER NOT NULL DEFAULT 0,
            photos_done INTEGER NOT NULL DEFAULT 0,
            photos_failed INTEGER NOT NULL DEFAULT 0,
            photos_skipped INTEGER NOT NULL DEFAULT 0,
            error_message TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS analysis_events (
            id TEXT PRIMARY KEY,
            analysis_job_id TEXT NOT NULL REFERENCES analysis_jobs(id),
            photo_id TEXT REFERENCES photos(id),
            event_type TEXT NOT NULL,
            message TEXT,
            result_summary TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS analysis_results (
            photo_id TEXT NOT NULL REFERENCES photos(id),
            capability TEXT NOT NULL,
            provider_id TEXT NOT NULL,
            schema_version INTEGER NOT NULL,
            result_json TEXT NOT NULL,
            confidence REAL,
            job_id TEXT REFERENCES analysis_jobs(id),
            generated_at TEXT NOT NULL,
            PRIMARY KEY (photo_id, capability, provider_id, schema_version)
        );
        CREATE TABLE IF NOT EXISTS persons (
            id TEXT PRIMARY KEY,
            display_name TEXT,
            rep_face_id TEXT,
            cluster_method TEXT NOT NULL,
            face_count INTEGER NOT NULL DEFAULT 0,
            is_hidden INTEGER NOT NULL DEFAULT 0,
            merged_into TEXT REFERENCES persons(id),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS faces (
            id TEXT PRIMARY KEY,
            photo_id TEXT NOT NULL REFERENCES photos(id),
            detected_by TEXT NOT NULL,
            bbox_x REAL NOT NULL,
            bbox_y REAL NOT NULL,
            bbox_w REAL NOT NULL,
            bbox_h REAL NOT NULL,
            confidence REAL NOT NULL,
            landmarks_json TEXT,
            embedding_path TEXT,
            embedding_dim INTEGER,
            person_id TEXT REFERENCES persons(id),
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS photo_faces (
            photo_id TEXT NOT NULL REFERENCES photos(id),
            face_id TEXT NOT NULL REFERENCES faces(id),
            PRIMARY KEY (photo_id, face_id)
        );
        CREATE TABLE IF NOT EXISTS photo_embeddings (
            photo_id TEXT NOT NULL REFERENCES photos(id),
            model_name TEXT NOT NULL,
            embedding_path TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            generated_at TEXT NOT NULL,
            PRIMARY KEY (photo_id, model_name)
        );
        CREATE TABLE IF NOT EXISTS background_tasks (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL,
            progress_label TEXT,
            detail TEXT,
            result TEXT,
            error TEXT,
            operation_payload_json TEXT,
            resume_checkpoint_json TEXT,
            created_at TEXT NOT NULL,
            started_at TEXT,
            updated_at TEXT NOT NULL,
            completed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_background_tasks_status
            ON background_tasks(status, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_background_tasks_kind
            ON background_tasks(kind, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status
            ON analysis_jobs(status, priority DESC, created_at);
        CREATE INDEX IF NOT EXISTS idx_analysis_jobs_capability
            ON analysis_jobs(capability, provider_id);
        CREATE INDEX IF NOT EXISTS idx_analysis_events_job
            ON analysis_events(analysis_job_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_analysis_results_capability
            ON analysis_results(capability, provider_id);
        CREATE INDEX IF NOT EXISTS idx_faces_photo ON faces(photo_id);
        CREATE INDEX IF NOT EXISTS idx_faces_person
            ON faces(person_id) WHERE person_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_faces_person_photo
            ON faces(person_id, photo_id) WHERE person_id IS NOT NULL AND status = 'active';
        CREATE INDEX IF NOT EXISTS idx_persons_name
            ON persons(display_name) WHERE display_name IS NOT NULL;
        -- Indexes on columns added by migrate_schema (content_hash,
        -- fingerprint, photo_tag_sources) live in `migrate_schema`
        -- below — see #content-hash-index-order. They MUST run after
        -- add_column_if_missing on older DBs or the CREATE INDEX
        -- references a column that doesn't exist yet.
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
    // Always run migrate_schema after initialize_schema. Several SQL pieces
    // (content_hash / fingerprint columns + their indexes, photo_tag_sources
    // table, analysis_* / faces / persons hand-offs) need to land in
    // migrate_schema first so older DBs upgrade in place, but new DBs also
    // need them — folding migrate into init keeps both code paths converged.
    migrate_schema(conn)?;
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
    add_column_if_missing(conn, "photos", "content_hash", "TEXT")?;
    add_column_if_missing(conn, "photos", "fingerprint", "TEXT NOT NULL DEFAULT ''")?;
    add_column_if_missing(conn, "photos", "logical_id", "TEXT")?;

    conn.execute(
        "UPDATE photos SET fingerprint = file_size || ':' || file_mtime \
         WHERE fingerprint IS NULL OR fingerprint = ''",
        [],
    )
    .map_err(|e| format!("Failed to backfill photo fingerprints: {}", e))?;

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
            name TEXT NOT NULL COLLATE NOCASE,
            canonical_name TEXT,
            semantic_key TEXT,
            kind TEXT NOT NULL DEFAULT 'manual',
            visibility TEXT NOT NULL DEFAULT 'user',
            created_by TEXT NOT NULL DEFAULT 'user',
            created_at TEXT NOT NULL,
            updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS photo_tags (
            photo_id TEXT NOT NULL REFERENCES photos(id),
            tag_id TEXT NOT NULL REFERENCES tags(id),
            added_at TEXT NOT NULL,
            PRIMARY KEY (photo_id, tag_id)
        );
        CREATE TABLE IF NOT EXISTS photo_tag_sources (
            photo_id TEXT NOT NULL REFERENCES photos(id),
            tag_id TEXT NOT NULL REFERENCES tags(id),
            source TEXT NOT NULL,
            confidence REAL,
            evidence_json TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            added_at TEXT NOT NULL,
            updated_at TEXT,
            PRIMARY KEY (photo_id, tag_id, source)
        );
        CREATE TABLE IF NOT EXISTS analysis_jobs (
            id TEXT PRIMARY KEY,
            capability TEXT NOT NULL,
            provider_id TEXT NOT NULL,
            schema_version INTEGER NOT NULL,
            scope_kind TEXT NOT NULL,
            scope_id TEXT,
            status TEXT NOT NULL,
            priority INTEGER NOT NULL DEFAULT 0,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            parent_job_id TEXT REFERENCES analysis_jobs(id),
            config_json TEXT,
            started_at TEXT,
            completed_at TEXT,
            photos_total INTEGER NOT NULL DEFAULT 0,
            photos_done INTEGER NOT NULL DEFAULT 0,
            photos_failed INTEGER NOT NULL DEFAULT 0,
            photos_skipped INTEGER NOT NULL DEFAULT 0,
            error_message TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS analysis_events (
            id TEXT PRIMARY KEY,
            analysis_job_id TEXT NOT NULL REFERENCES analysis_jobs(id),
            photo_id TEXT REFERENCES photos(id),
            event_type TEXT NOT NULL,
            message TEXT,
            result_summary TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS analysis_results (
            photo_id TEXT NOT NULL REFERENCES photos(id),
            capability TEXT NOT NULL,
            provider_id TEXT NOT NULL,
            schema_version INTEGER NOT NULL,
            result_json TEXT NOT NULL,
            confidence REAL,
            job_id TEXT REFERENCES analysis_jobs(id),
            generated_at TEXT NOT NULL,
            PRIMARY KEY (photo_id, capability, provider_id, schema_version)
        );
        CREATE TABLE IF NOT EXISTS persons (
            id TEXT PRIMARY KEY,
            display_name TEXT,
            rep_face_id TEXT,
            cluster_method TEXT NOT NULL,
            face_count INTEGER NOT NULL DEFAULT 0,
            is_hidden INTEGER NOT NULL DEFAULT 0,
            merged_into TEXT REFERENCES persons(id),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS faces (
            id TEXT PRIMARY KEY,
            photo_id TEXT NOT NULL REFERENCES photos(id),
            detected_by TEXT NOT NULL,
            bbox_x REAL NOT NULL,
            bbox_y REAL NOT NULL,
            bbox_w REAL NOT NULL,
            bbox_h REAL NOT NULL,
            confidence REAL NOT NULL,
            landmarks_json TEXT,
            embedding_path TEXT,
            embedding_dim INTEGER,
            person_id TEXT REFERENCES persons(id),
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS photo_faces (
            photo_id TEXT NOT NULL REFERENCES photos(id),
            face_id TEXT NOT NULL REFERENCES faces(id),
            PRIMARY KEY (photo_id, face_id)
        );
        CREATE TABLE IF NOT EXISTS photo_embeddings (
            photo_id TEXT NOT NULL REFERENCES photos(id),
            model_name TEXT NOT NULL,
            embedding_path TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            generated_at TEXT NOT NULL,
            PRIMARY KEY (photo_id, model_name)
        );
        CREATE TABLE IF NOT EXISTS background_tasks (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL,
            progress_label TEXT,
            detail TEXT,
            result TEXT,
            error TEXT,
            operation_payload_json TEXT,
            resume_checkpoint_json TEXT,
            created_at TEXT NOT NULL,
            started_at TEXT,
            updated_at TEXT NOT NULL,
            completed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_background_tasks_status
            ON background_tasks(status, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_background_tasks_kind
            ON background_tasks(kind, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status
            ON analysis_jobs(status, priority DESC, created_at);
        CREATE INDEX IF NOT EXISTS idx_analysis_jobs_capability
            ON analysis_jobs(capability, provider_id);
        CREATE INDEX IF NOT EXISTS idx_analysis_events_job
            ON analysis_events(analysis_job_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_analysis_results_capability
            ON analysis_results(capability, provider_id);
        CREATE INDEX IF NOT EXISTS idx_faces_photo ON faces(photo_id);
        CREATE INDEX IF NOT EXISTS idx_faces_person
            ON faces(person_id) WHERE person_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_faces_person_photo
            ON faces(person_id, photo_id) WHERE person_id IS NOT NULL AND status = 'active';
        CREATE INDEX IF NOT EXISTS idx_persons_name
            ON persons(display_name) WHERE display_name IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_photos_content_hash
            ON photos(content_hash) WHERE content_hash IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_photos_fingerprint
            ON photos(file_size, file_mtime, fingerprint);
        CREATE INDEX IF NOT EXISTS idx_photo_tag_sources_source
            ON photo_tag_sources(source, tag_id, photo_id);
        "#,
    )
    .map_err(|e| format!("Failed to create new tables: {}", e))?;

    add_column_if_missing(conn, "tags", "canonical_name", "TEXT")?;
    add_column_if_missing(conn, "tags", "semantic_key", "TEXT")?;
    add_column_if_missing(conn, "tags", "kind", "TEXT NOT NULL DEFAULT 'manual'")?;
    add_column_if_missing(conn, "tags", "visibility", "TEXT NOT NULL DEFAULT 'user'")?;
    add_column_if_missing(conn, "tags", "created_by", "TEXT NOT NULL DEFAULT 'user'")?;
    add_column_if_missing(conn, "tags", "updated_at", "TEXT")?;
    rebuild_tags_table_if_global_name_unique(conn)?;
    add_column_if_missing(conn, "photo_tag_sources", "evidence_json", "TEXT")?;
    add_column_if_missing(conn, "photo_tag_sources", "status", "TEXT NOT NULL DEFAULT 'active'")?;
    add_column_if_missing(conn, "photo_tag_sources", "updated_at", "TEXT")?;

    conn.execute_batch(
        r#"
        CREATE INDEX IF NOT EXISTS idx_tags_kind
            ON tags(kind, canonical_name);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_kind_semantic_key
            ON tags(kind, semantic_key) WHERE semantic_key IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_tags_visibility
            ON tags(visibility, kind);
        CREATE INDEX IF NOT EXISTS idx_photo_tag_sources_status
            ON photo_tag_sources(status, source, tag_id);
        "#,
    )
    .map_err(|e| format!("Failed to create tag layer indexes: {}", e))?;

    migrate_photo_tag_sources(conn)?;
    backfill_tag_layer_metadata(conn)?;

    if current_version < SCHEMA_VERSION {
        conn.execute(
            "UPDATE schema_version SET version = ?1",
            params![SCHEMA_VERSION],
        )
        .map_err(|e| format!("Failed to update schema version: {}", e))?;
    }
    Ok(())
}

fn table_columns(conn: &Connection, table: &str) -> Result<HashSet<String>, String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({})", table))
        .map_err(|e| format!("Failed to inspect schema for {}: {}", table, e))?;

    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| format!("Failed to query schema for {}: {}", table, e))?
        .collect::<SqlResult<HashSet<_>>>()
        .map_err(|e| format!("Failed to collect schema for {}: {}", table, e))?;

    Ok(columns)
}


fn rebuild_tags_table_if_global_name_unique(conn: &Connection) -> Result<(), String> {
    let table_sql: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tags'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to inspect tags table SQL: {}", e))?;

    let normalized = table_sql.to_uppercase();
    if !normalized.contains("NAME TEXT NOT NULL UNIQUE") && !normalized.contains("UNIQUE COLLATE NOCASE") {
        return Ok(());
    }

    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = OFF;
        DROP INDEX IF EXISTS idx_tags_kind;
        DROP INDEX IF EXISTS idx_tags_visibility;
        DROP INDEX IF EXISTS idx_tags_kind_semantic_key;
        CREATE TABLE IF NOT EXISTS tags_v13 (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL COLLATE NOCASE,
            canonical_name TEXT,
            semantic_key TEXT,
            kind TEXT NOT NULL DEFAULT 'manual',
            visibility TEXT NOT NULL DEFAULT 'user',
            created_by TEXT NOT NULL DEFAULT 'user',
            created_at TEXT NOT NULL,
            updated_at TEXT
        );
        INSERT OR IGNORE INTO tags_v13
            (id, name, canonical_name, semantic_key, kind, visibility, created_by, created_at, updated_at)
        SELECT id,
               name,
               COALESCE(NULLIF(TRIM(canonical_name), ''), lower(trim(name))),
               semantic_key,
               COALESCE(NULLIF(kind, ''), 'manual'),
               COALESCE(NULLIF(visibility, ''), 'user'),
               COALESCE(NULLIF(created_by, ''), 'user'),
               created_at,
               COALESCE(updated_at, created_at)
        FROM tags;
        DROP TABLE tags;
        ALTER TABLE tags_v13 RENAME TO tags;
        "#,
    )
    .map_err(|e| format!("Failed to rebuild tags table without global name uniqueness: {}", e))?;
    Ok(())
}

fn migrate_photo_tag_sources(conn: &Connection) -> Result<(), String> {
    let columns = table_columns(conn, "photo_tags")?;
    if columns.contains("source") {
        conn.execute_batch(
            r#"
            INSERT OR IGNORE INTO photo_tag_sources
                (photo_id, tag_id, source, confidence, added_at)
            SELECT photo_id, tag_id, source, confidence, created_at
            FROM photo_tags
            WHERE source IS NOT NULL;

            ALTER TABLE photo_tags RENAME TO photo_tags_legacy_source;

            CREATE TABLE photo_tags (
                photo_id TEXT NOT NULL REFERENCES photos(id),
                tag_id TEXT NOT NULL REFERENCES tags(id),
                added_at TEXT NOT NULL,
                PRIMARY KEY (photo_id, tag_id)
            );

            INSERT OR IGNORE INTO photo_tags (photo_id, tag_id, added_at)
            SELECT photo_id, tag_id, MIN(created_at)
            FROM photo_tags_legacy_source
            GROUP BY photo_id, tag_id;

            DROP TABLE photo_tags_legacy_source;
            "#,
        )
        .map_err(|e| format!("Failed to migrate legacy photo_tags sources: {}", e))?;
    } else {
        conn.execute(
            "INSERT OR IGNORE INTO photo_tag_sources \
                (photo_id, tag_id, source, confidence, added_at) \
             SELECT pt.photo_id, pt.tag_id, 'manual', NULL, pt.added_at \
             FROM photo_tags pt \
             WHERE NOT EXISTS ( \
                SELECT 1 FROM photo_tag_sources pts \
                WHERE pts.photo_id = pt.photo_id AND pts.tag_id = pt.tag_id \
             )",
            [],
        )
        .map_err(|e| format!("Failed to backfill photo tag sources: {}", e))?;
    }

    conn.execute(
        "DELETE FROM photo_tags \
         WHERE NOT EXISTS ( \
             SELECT 1 FROM photo_tag_sources pts \
             WHERE pts.photo_id = photo_tags.photo_id AND pts.tag_id = photo_tags.tag_id \
         )",
        [],
    )
    .map_err(|e| format!("Failed to prune source-less photo tags: {}", e))?;

    Ok(())
}

fn backfill_tag_layer_metadata(conn: &Connection) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE tags SET canonical_name = lower(trim(name)) \
         WHERE canonical_name IS NULL OR canonical_name = ''",
        [],
    )
    .map_err(|e| format!("Failed to backfill tag canonical names: {}", e))?;
    conn.execute(
        "UPDATE tags SET updated_at = COALESCE(updated_at, created_at, ?1)",
        params![now],
    )
    .map_err(|e| format!("Failed to backfill tag updated_at: {}", e))?;
    conn.execute(
        "UPDATE photo_tag_sources SET status = COALESCE(status, 'active') \
         WHERE status IS NULL OR status = ''",
        [],
    )
    .map_err(|e| format!("Failed to backfill tag source status: {}", e))?;
    conn.execute(
        "UPDATE photo_tag_sources SET updated_at = COALESCE(updated_at, added_at, ?1)",
        params![now],
    )
    .map_err(|e| format!("Failed to backfill tag source updated_at: {}", e))?;
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

fn photo_fingerprint(photo: &DiscoveredPhoto) -> String {
    format!("{}:{}", photo.file_size, photo.file_mtime)
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
    let existing: HashMap<String, (String, i64, i64, String)> = {
        let mut stmt = conn
            .prepare(
                "SELECT relative_path, id, file_size, file_mtime, fingerprint FROM photos WHERE source_id = ?1",
            )
            .map_err(|e| format!("Failed to prepare existing-photos query: {}", e))?;
        let rows: Vec<(String, (String, i64, i64, String))> = stmt
            .query_map(params![source_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    (
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, i64>(3)?,
                        row.get::<_, String>(4)?,
                    ),
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
        let fingerprint = photo_fingerprint(photo);
        seen.insert(relative_path.clone());

        if let Some((existing_id, existing_size, existing_mtime, existing_fingerprint)) =
            existing.get(&relative_path)
        {
            if *existing_size == photo.file_size as i64
                && *existing_mtime == photo.file_mtime
                && existing_fingerprint == &fingerprint
            {
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
                        fingerprint = ?4, content_hash = NULL, \
                        status = 'indexed', captured_at = NULL, camera_make = NULL, \
                        camera_model = NULL, lens_model = NULL, \
                        gps_latitude = NULL, gps_longitude = NULL, \
                        width = NULL, height = NULL, updated_at = ?5 \
                     WHERE id = ?6",
                    params![
                        absolute_path_str,
                        photo.file_size as i64,
                        photo.file_mtime,
                        fingerprint,
                        now,
                        existing_id
                    ],
                )
                .map_err(|e| format!("Failed to update photo: {}", e))?;
                tx.execute(
                    "DELETE FROM photo_assets WHERE photo_id = ?1",
                    params![existing_id],
                )
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
                     extension, file_size, file_mtime, fingerprint, status, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    photo_id, source_id, relative_path, absolute_path_str,
                    photo.file_name, photo.extension,
                    photo.file_size as i64, photo.file_mtime, fingerprint,
                    "indexed", now, now
                ],
            )
            .map_err(|e| format!("Failed to insert photo: {}", e))?;
            result.push(UpsertedPhoto {
                id: photo_id,
                absolute_path: absolute_path_str,
                needs_thumbnail: true,
            });
        }
    }

    // Remove photos that disappeared from disk
    for (relative_path, (photo_id, _, _, _)) in &existing {
        if !seen.contains(relative_path) {
            let _ = tx.execute(
                "DELETE FROM album_photos WHERE photo_id = ?1",
                params![photo_id],
            );
            tx.execute(
                "DELETE FROM photo_assets WHERE photo_id = ?1",
                params![photo_id],
            )
            .map_err(|e| format!("Failed to delete photo assets: {}", e))?;
            tx.execute("DELETE FROM photos WHERE id = ?1", params![photo_id])
                .map_err(|e| format!("Failed to delete photo: {}", e))?;
        }
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit upsert: {}", e))?;
    Ok(result)
}

pub fn replace_source_photos(
    conn: &mut Connection,
    source_id: &str,
    root_path: &Path,
    photos: &[DiscoveredPhoto],
) -> Result<Vec<UpsertedPhoto>, String> {
    upsert_source_photos(conn, source_id, root_path, photos)
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
    folder_path
        .rsplit('/')
        .next()
        .unwrap_or(folder_path)
        .to_string()
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
            row.map_err(|e| format!("Failed to read source folder row: {}", e))?;
        source_names.insert(source_id.clone(), source_name);
        *folder_counts
            .entry((source_id.clone(), String::new()))
            .or_insert(0) += 1;
        let folder_path = folder_path_for_relative_path(&relative_path);
        if folder_path.is_empty() {
            continue;
        }
        let segments: Vec<&str> = folder_path.split('/').filter(|s| !s.is_empty()).collect();
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
            source_names.get(&source_id).map(|sn| {
                let depth = if folder_path.is_empty() {
                    0
                } else {
                    folder_path.split('/').count() as i64
                };
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
        let na = source_names
            .get(&a.source_id)
            .map(String::as_str)
            .unwrap_or("");
        let nb = source_names
            .get(&b.source_id)
            .map(String::as_str)
            .unwrap_or("");
        na.cmp(nb).then_with(|| a.folder_path.cmp(&b.folder_path))
    });

    Ok(folders)
}

fn timeline_photo_from_row(row: &Row<'_>) -> SqlResult<TimelinePhoto> {
    let relative_path: String = row.get(2)?;
    let file_mtime: i64 = row.get(3)?;
    let captured_at: Option<String> = row.get(11)?;
    let captured_at =
        captured_at.or_else(|| DateTime::from_timestamp(file_mtime, 0).map(|d| d.to_rfc3339()));
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
        tags: vec![], // populated separately when needed
    })
}


fn canonical_tag_name(name: &str) -> String {
    name.trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn upsert_tag(
    conn: &Connection,
    name: &str,
    kind: &str,
    visibility: &str,
    created_by: &str,
) -> Result<String, String> {
    let display_name = name.trim();
    if display_name.is_empty() {
        return Err("Tag name cannot be empty".to_string());
    }
    let canonical = canonical_tag_name(display_name);
    if let Ok(id) = conn.query_row(
        "SELECT id FROM tags WHERE kind = ?1 AND canonical_name = ?2",
        params![kind, canonical],
        |row| row.get::<_, String>(0),
    ) {
        return Ok(id);
    }
    // Back-compat: old manual tags were unique only by name. Reuse them instead
    // of creating a duplicate row, then enrich their new metadata columns.
    if kind == "manual" {
        if let Ok(id) = conn.query_row(
            "SELECT id FROM tags WHERE name = ?1 COLLATE NOCASE AND kind = 'manual'",
            params![display_name],
            |row| row.get::<_, String>(0),
        ) {
            let now = Utc::now().to_rfc3339();
            conn.execute(
                "UPDATE tags SET canonical_name = ?1, visibility = ?2, created_by = ?3, updated_at = ?4 WHERE id = ?5",
                params![canonical, visibility, created_by, now, id],
            )
            .map_err(|e| format!("Failed to enrich existing tag: {}", e))?;
            return Ok(id);
        }
    }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO tags (id, name, canonical_name, semantic_key, kind, visibility, created_by, created_at, updated_at) \
         VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?7)",
        params![id, display_name, canonical, kind, visibility, created_by, now],
    )
    .map_err(|e| format!("Failed to insert tag: {}", e))?;
    Ok(id)
}

pub fn upsert_semantic_tag(
    conn: &Connection,
    name: &str,
    kind: &str,
    semantic_key: &str,
    visibility: &str,
    created_by: &str,
) -> Result<String, String> {
    let display_name = name.trim();
    if display_name.is_empty() {
        return Err("Label name cannot be empty".to_string());
    }
    let semantic_key = semantic_key.trim();
    if semantic_key.is_empty() {
        return Err("Label semantic key cannot be empty".to_string());
    }
    let canonical = canonical_tag_name(display_name);
    let now = Utc::now().to_rfc3339();

    if let Ok(id) = conn.query_row(
        "SELECT id FROM tags WHERE kind = ?1 AND semantic_key = ?2",
        params![kind, semantic_key],
        |row| row.get::<_, String>(0),
    ) {
        conn.execute(
            "UPDATE tags SET name = ?1, canonical_name = ?2, visibility = ?3, \
             created_by = ?4, updated_at = ?5 WHERE id = ?6",
            params![display_name, canonical, visibility, created_by, now, id],
        )
        .map_err(|e| format!("Failed to update semantic label: {}", e))?;
        return Ok(id);
    }

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO tags (id, name, canonical_name, semantic_key, kind, visibility, created_by, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
        params![id, display_name, canonical, semantic_key, kind, visibility, created_by, now],
    )
    .map_err(|e| format!("Failed to insert semantic label: {}", e))?;
    Ok(id)
}

pub fn refresh_photo_tag_projection(
    conn: &Connection,
    photo_id: &str,
    tag_id: &str,
) -> Result<(), String> {
    let active_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM photo_tag_sources \
             WHERE photo_id = ?1 AND tag_id = ?2 AND status IN ('active', 'confirmed')",
            params![photo_id, tag_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to count active tag sources: {}", e))?;
    let rejected_by_user: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM photo_tag_sources \
             WHERE photo_id = ?1 AND tag_id = ?2 AND source = 'user' AND status = 'rejected'",
            params![photo_id, tag_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to count rejected tag sources: {}", e))?;

    if active_count > 0 && rejected_by_user == 0 {
        let added_at = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR IGNORE INTO photo_tags (photo_id, tag_id, added_at) VALUES (?1, ?2, ?3)",
            params![photo_id, tag_id, added_at],
        )
        .map_err(|e| format!("Failed to materialize photo tag: {}", e))?;
    } else {
        conn.execute(
            "DELETE FROM photo_tags WHERE photo_id = ?1 AND tag_id = ?2",
            params![photo_id, tag_id],
        )
        .map_err(|e| format!("Failed to prune photo tag projection: {}", e))?;
    }
    Ok(())
}

pub fn upsert_photo_tag_source(
    conn: &Connection,
    photo_id: &str,
    tag_id: &str,
    source: &str,
    confidence: Option<f64>,
    evidence_json: Option<&str>,
    status: &str,
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO photo_tag_sources \
         (photo_id, tag_id, source, confidence, evidence_json, status, added_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7) \
         ON CONFLICT(photo_id, tag_id, source) DO UPDATE SET \
            confidence = excluded.confidence, \
            evidence_json = excluded.evidence_json, \
            status = excluded.status, \
            updated_at = excluded.updated_at",
        params![photo_id, tag_id, source, confidence, evidence_json, status, now],
    )
    .map_err(|e| format!("Failed to upsert photo tag source: {}", e))?;
    refresh_photo_tag_projection(conn, photo_id, tag_id)
}

fn remove_photo_tag_source(
    conn: &Connection,
    photo_id: &str,
    tag_id: &str,
    source: &str,
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM photo_tag_sources WHERE photo_id = ?1 AND tag_id = ?2 AND source = ?3",
        params![photo_id, tag_id, source],
    )
    .map_err(|e| format!("Failed to delete photo tag source: {}", e))?;
    refresh_photo_tag_projection(conn, photo_id, tag_id)
}

pub fn get_photo_tags(conn: &Connection, photo_id: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.name FROM tags t \
              INNER JOIN photo_tags pt ON pt.tag_id = t.id \
              WHERE pt.photo_id = ?1 AND t.kind = 'manual' AND t.visibility = 'user' \
              ORDER BY t.name COLLATE NOCASE",
        )
        .map_err(|e| format!("Failed to prepare get_photo_tags: {}", e))?;
    let tags = stmt
        .query_map(params![photo_id], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Failed to query photo tags: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect photo tags: {}", e))?;
    Ok(tags)
}

pub fn set_photo_tags(
    conn: &Connection,
    photo_id: &str,
    tags: &[String],
) -> Result<Vec<String>, String> {
    let normalized: HashSet<String> = tags
        .iter()
        .map(|t| canonical_tag_name(t))
        .filter(|t| !t.is_empty())
        .collect();

    for tag in tags {
        let tag_name = tag.trim();
        if tag_name.is_empty() {
            continue;
        }
        let tag_id = upsert_tag(conn, tag_name, "manual", "user", "user")?;
        upsert_photo_tag_source(conn, photo_id, &tag_id, "user", None, None, "active")?;
    }

    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.canonical_name FROM tags t \
             INNER JOIN photo_tag_sources pts ON pts.tag_id = t.id \
             WHERE pts.photo_id = ?1 AND pts.source = 'user' AND t.kind = 'manual'",
        )
        .map_err(|e| format!("Failed to prepare manual tag source query: {}", e))?;
    let current = stmt
        .query_map(params![photo_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| format!("Failed to query manual tag sources: {}", e))?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect manual tag sources: {}", e))?;

    for (tag_id, canonical) in current {
        if !normalized.contains(&canonical) {
            remove_photo_tag_source(conn, photo_id, &tag_id, "user")?;
        }
    }

    get_photo_tags(conn, photo_id)
}

pub fn get_all_tags(conn: &Connection) -> Result<Vec<Tag>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.name, COUNT(pt.photo_id) as cnt \
              FROM tags t LEFT JOIN photo_tags pt ON pt.tag_id = t.id \
              WHERE t.kind = 'manual' AND t.visibility = 'user' \
              GROUP BY t.id ORDER BY t.name COLLATE NOCASE",
        )
        .map_err(|e| format!("Failed to prepare get_all_tags: {}", e))?;
    let tags = stmt
        .query_map([], |row| {
            Ok(Tag {
                name: row.get(0)?,
                photo_count: row.get(1)?,
            })
        })
        .map_err(|e| format!("Failed to query tags: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect tags: {}", e))?;
    Ok(tags)
}

pub fn get_photos_by_tag(
    conn: &Connection,
    tag_name: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<TimelinePhoto>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {cols} {joins} \
              INNER JOIN photo_tags pt ON p.id = pt.photo_id \
              INNER JOIN tags t ON pt.tag_id = t.id \
              WHERE {asset} AND p.hidden_at IS NULL AND t.name = ?3 COLLATE NOCASE \
                AND t.kind = 'manual' AND t.visibility = 'user' \
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


fn person_label_name(person_id: &str, display_name: Option<&str>) -> String {
    display_name
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("Person · {}", &person_id[..person_id.len().min(6)]))
}

pub fn sync_person_label(conn: &Connection, person_id: &str) -> Result<Option<String>, String> {
    let person = conn.query_row(
        "SELECT display_name, is_hidden, merged_into FROM persons WHERE id = ?1",
        params![person_id],
        |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        },
    );

    let (display_name, is_hidden, merged_into) = match person {
        Ok(row) => row,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(e) => return Err(format!("Failed to load person for label sync: {}", e)),
    };

    let label_name = person_label_name(person_id, display_name.as_deref());
    let semantic_key = format!("person:{}", person_id);
    let visibility = if is_hidden != 0 || merged_into.is_some() { "hidden" } else { "system" };
    let created_by = if display_name.as_deref().map(str::trim).filter(|s| !s.is_empty()).is_some() {
        "user"
    } else {
        "face.cluster"
    };
    let tag_id = upsert_semantic_tag(conn, &label_name, "person", &semantic_key, visibility, created_by)?;

    if visibility == "hidden" {
        let mut stmt = conn
            .prepare("SELECT photo_id FROM photo_tag_sources WHERE tag_id = ?1 AND source = 'face.cluster'")
            .map_err(|e| format!("Failed to prepare hidden person source query: {}", e))?;
        let affected = stmt
            .query_map(params![tag_id.clone()], |row| row.get::<_, String>(0))
            .map_err(|e| format!("Failed to query hidden person sources: {}", e))?
            .collect::<SqlResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect hidden person sources: {}", e))?;
        drop(stmt);
        conn.execute(
            "DELETE FROM photo_tag_sources WHERE tag_id = ?1 AND source = 'face.cluster'",
            params![tag_id.clone()],
        )
        .map_err(|e| format!("Failed to delete hidden person sources: {}", e))?;
        for photo_id in affected {
            refresh_photo_tag_projection(conn, &photo_id, &tag_id)?;
        }
        return Ok(Some(tag_id));
    }

    let mut stmt = conn
        .prepare(
            "SELECT f.photo_id, MAX(f.confidence) AS confidence, COUNT(*) AS face_count \
             FROM faces f \
             WHERE f.person_id = ?1 AND f.status = 'active' \
             GROUP BY f.photo_id",
        )
        .map_err(|e| format!("Failed to prepare person face query: {}", e))?;
    let rows = stmt
        .query_map(params![person_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<f64>>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|e| format!("Failed to query person faces: {}", e))?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect person faces: {}", e))?;

    let active_photo_ids: HashSet<String> = rows.iter().map(|(photo_id, _, _)| photo_id.clone()).collect();
    for (photo_id, confidence, face_count) in rows {
        let evidence = serde_json::json!({
            "personId": person_id,
            "faceCount": face_count,
        })
        .to_string();
        upsert_photo_tag_source(
            conn,
            &photo_id,
            &tag_id,
            "face.cluster",
            confidence,
            Some(&evidence),
            "active",
        )?;
    }

    let mut stale_stmt = conn
        .prepare("SELECT photo_id FROM photo_tag_sources WHERE tag_id = ?1 AND source = 'face.cluster'")
        .map_err(|e| format!("Failed to prepare stale person label query: {}", e))?;
    let stale = stale_stmt
        .query_map(params![tag_id.clone()], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Failed to query stale person label sources: {}", e))?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect stale person label sources: {}", e))?;
    drop(stale_stmt);
    for photo_id in stale {
        if !active_photo_ids.contains(&photo_id) {
            remove_photo_tag_source(conn, &photo_id, &tag_id, "face.cluster")?;
        }
    }

    Ok(Some(tag_id))
}

pub fn sync_all_person_labels(conn: &Connection) -> Result<i64, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM persons")
        .map_err(|e| format!("Failed to prepare persons label sync query: {}", e))?;
    let person_ids = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Failed to query persons for label sync: {}", e))?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect persons for label sync: {}", e))?;
    drop(stmt);

    let mut synced = 0_i64;
    for person_id in person_ids {
        if sync_person_label(conn, &person_id)?.is_some() {
            synced += 1;
        }
    }
    Ok(synced)
}


fn display_name_from_identifier(identifier: &str) -> String {
    let cleaned = identifier
        .replace(['_', '-'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if cleaned.is_empty() {
        return "Unknown".to_string();
    }
    cleaned
        .split(' ')
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str().to_lowercase()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn replace_content_label_sources(
    conn: &Connection,
    photo_id: &str,
    provider_id: &str,
    labels: &[(String, f64)],
    min_confidence: f64,
) -> Result<i64, String> {
    let mut existing_stmt = conn
        .prepare(
            "SELECT pts.tag_id FROM photo_tag_sources pts \
             INNER JOIN tags t ON t.id = pts.tag_id \
             WHERE pts.photo_id = ?1 AND pts.source = ?2 AND t.kind = 'subject'",
        )
        .map_err(|e| format!("Failed to prepare existing content label query: {}", e))?;
    let existing = existing_stmt
        .query_map(params![photo_id, provider_id], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Failed to query existing content labels: {}", e))?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect existing content labels: {}", e))?;
    drop(existing_stmt);

    for tag_id in existing {
        remove_photo_tag_source(conn, photo_id, &tag_id, provider_id)?;
    }

    let mut written = 0_i64;
    let mut seen = HashSet::new();
    for (identifier, confidence) in labels {
        if *confidence < min_confidence {
            continue;
        }
        let canonical = canonical_tag_name(identifier);
        if canonical.is_empty() || !seen.insert(canonical.clone()) {
            continue;
        }
        let name = display_name_from_identifier(identifier);
        let semantic_key = format!("subject:{}", canonical);
        let tag_id = upsert_semantic_tag(conn, &name, "subject", &semantic_key, "system", provider_id)?;
        let evidence = serde_json::json!({
            "capability": "content.classify",
            "providerId": provider_id,
            "identifier": identifier,
        })
        .to_string();
        upsert_photo_tag_source(
            conn,
            photo_id,
            &tag_id,
            provider_id,
            Some(*confidence),
            Some(&evidence),
            "active",
        )?;
        written += 1;
    }
    Ok(written)
}

pub fn materialize_content_classification_results(
    conn: &Connection,
    min_confidence: f64,
    source_id: Option<&str>,
) -> Result<(i64, i64), String> {
    let mut stmt = conn
        .prepare(
            "SELECT ar.photo_id, ar.provider_id, ar.result_json \
             FROM analysis_results ar \
             INNER JOIN photos p ON p.id = ar.photo_id \
             WHERE ar.capability = 'content.classify' \
               AND (?1 IS NULL OR p.source_id = ?1) \
             ORDER BY ar.generated_at DESC",
        )
        .map_err(|e| format!("Failed to prepare content classification results query: {}", e))?;
    let rows = stmt
        .query_map(params![source_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| format!("Failed to query content classification results: {}", e))?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect content classification results: {}", e))?;
    drop(stmt);

    let mut photos = 0_i64;
    let mut labels = 0_i64;
    for (photo_id, provider_id, result_json) in rows {
        let parsed: serde_json::Value = serde_json::from_str(&result_json)
            .map_err(|e| format!("Failed to parse content classification result for {}: {}", photo_id, e))?;
        let label_rows = parsed
            .get("labels")
            .and_then(|value| value.as_array())
            .cloned()
            .unwrap_or_default();
        let mut extracted = Vec::new();
        for label in label_rows {
            let identifier = label
                .get("identifier")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim();
            let confidence = label
                .get("confidence")
                .and_then(|value| value.as_f64())
                .unwrap_or(0.0);
            if !identifier.is_empty() {
                extracted.push((identifier.to_string(), confidence));
            }
        }
        labels += replace_content_label_sources(conn, &photo_id, &provider_id, &extracted, min_confidence)?;
        photos += 1;
    }

    Ok((photos, labels))
}

pub fn get_labels(conn: &Connection, kind: Option<&str>) -> Result<Vec<Label>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.name, t.kind, t.semantic_key, t.visibility, t.created_by, \
                    COUNT(DISTINCT pts.source) AS source_count, \
                    COUNT(DISTINCT pt.photo_id) AS photo_count \
             FROM tags t \
             LEFT JOIN photo_tags pt ON pt.tag_id = t.id \
             LEFT JOIN photo_tag_sources pts ON pts.tag_id = t.id AND pts.status IN ('active', 'confirmed') \
             WHERE (?1 IS NULL OR t.kind = ?1) AND t.visibility != 'hidden' \
             GROUP BY t.id \
             HAVING photo_count > 0 OR t.kind = 'manual' \
             ORDER BY CASE t.kind WHEN 'person' THEN 0 WHEN 'subject' THEN 1 WHEN 'manual' THEN 2 ELSE 3 END, \
                      photo_count DESC, t.name COLLATE NOCASE",
        )
        .map_err(|e| format!("Failed to prepare labels query: {}", e))?;
    let labels = stmt
        .query_map(params![kind], |row| {
            Ok(Label {
                id: row.get(0)?,
                name: row.get(1)?,
                kind: row.get(2)?,
                semantic_key: row.get(3)?,
                visibility: row.get(4)?,
                created_by: row.get(5)?,
                source_count: row.get(6)?,
                photo_count: row.get(7)?,
            })
        })
        .map_err(|e| format!("Failed to query labels: {}", e))?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect labels: {}", e))?;
    Ok(labels)
}

pub fn get_photos_by_label(
    conn: &Connection,
    label_id: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<TimelinePhoto>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {cols} {joins} \
              INNER JOIN photo_tags pt ON p.id = pt.photo_id \
              WHERE {asset} AND p.hidden_at IS NULL AND pt.tag_id = ?3 \
              ORDER BY COALESCE(strftime('%s', p.captured_at), p.file_mtime) DESC LIMIT ?1 OFFSET ?2",
            cols = PHOTO_COLS,
            joins = PHOTO_JOINS,
            asset = ASSET_READY_COND
        ))
        .map_err(|e| format!("Failed to prepare label photos query: {}", e))?;
    let photos = stmt
        .query_map(params![limit, offset, label_id], timeline_photo_from_row)
        .map_err(|e| format!("Failed to query label photos: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect label photos: {}", e))?;
    Ok(photos)
}

pub fn get_timeline_photos(
    conn: &Connection,
    limit: i64,
    offset: i64,
    source_id: Option<&str>,
    folder_path: Option<&str>,
) -> Result<Vec<TimelinePhoto>, String> {
    let normalized = folder_path
        .map(normalize_relative_path)
        .filter(|p| !p.is_empty());
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
        .query_map(
            params![limit, offset, source_id, normalized],
            timeline_photo_from_row,
        )
        .map_err(|e| format!("Failed to query timeline: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect timeline: {}", e))?;
    Ok(photos)
}

fn escaped_like_pattern(query: &str) -> String {
    let mut pattern = String::from("%");
    for ch in query.trim().chars() {
        match ch {
            '\\' | '%' | '_' => {
                pattern.push('\\');
                pattern.push(ch);
            }
            _ => pattern.push(ch),
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

pub fn get_recently_added_photos(
    conn: &Connection,
    limit: i64,
    offset: i64,
) -> Result<Vec<TimelinePhoto>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {cols} {joins} \
             WHERE {asset} AND p.hidden_at IS NULL \
               AND p.created_at >= datetime('now', '-7 days') \
             ORDER BY p.created_at DESC LIMIT ?1 OFFSET ?2",
            cols = PHOTO_COLS,
            joins = PHOTO_JOINS,
            asset = ASSET_READY_COND
        ))
        .map_err(|e| format!("Failed to prepare recent query: {}", e))?;

    let photos = stmt
        .query_map(params![limit, offset], timeline_photo_from_row)
        .map_err(|e| format!("Failed to query recent: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect recent: {}", e))?;
    Ok(photos)
}

pub fn get_favorite_photos(
    conn: &Connection,
    limit: i64,
    offset: i64,
) -> Result<Vec<TimelinePhoto>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {cols} {joins} \
             WHERE {asset} AND p.hidden_at IS NULL AND p.favorited_at IS NOT NULL \
             ORDER BY p.favorited_at DESC LIMIT ?1 OFFSET ?2",
            cols = PHOTO_COLS,
            joins = PHOTO_JOINS,
            asset = ASSET_READY_COND
        ))
        .map_err(|e| format!("Failed to prepare favorites query: {}", e))?;

    let photos = stmt
        .query_map(params![limit, offset], timeline_photo_from_row)
        .map_err(|e| format!("Failed to query favorites: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect favorites: {}", e))?;
    Ok(photos)
}

pub fn get_hidden_photos(
    conn: &Connection,
    limit: i64,
    offset: i64,
) -> Result<Vec<TimelinePhoto>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {cols} {joins} \
             WHERE {asset} AND p.hidden_at IS NOT NULL \
             ORDER BY p.hidden_at DESC LIMIT ?1 OFFSET ?2",
            cols = PHOTO_COLS,
            joins = PHOTO_JOINS,
            asset = ASSET_READY_COND
        ))
        .map_err(|e| format!("Failed to prepare hidden query: {}", e))?;

    let photos = stmt
        .query_map(params![limit, offset], timeline_photo_from_row)
        .map_err(|e| format!("Failed to query hidden: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect hidden: {}", e))?;
    Ok(photos)
}

pub fn set_photo_favorite(
    conn: &Connection,
    photo_id: &str,
    favorited: bool,
) -> Result<bool, String> {
    let now = Utc::now().to_rfc3339();
    let favorited_at: Option<String> = if favorited { Some(now) } else { None };
    conn.execute(
        "UPDATE photos SET favorited_at = ?1 WHERE id = ?2",
        params![favorited_at, photo_id],
    )
    .map_err(|e| format!("Failed to update favorite: {}", e))?;
    Ok(favorited)
}

pub fn set_photo_hidden(conn: &Connection, photo_id: &str, hidden: bool) -> Result<bool, String> {
    let now = Utc::now().to_rfc3339();
    let hidden_at: Option<String> = if hidden { Some(now) } else { None };
    conn.execute(
        "UPDATE photos SET hidden_at = ?1 WHERE id = ?2",
        params![hidden_at, photo_id],
    )
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
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;
    for photo_id in photo_ids {
        tx.execute(
            "UPDATE photos SET favorited_at = ?1 WHERE id = ?2",
            params![value, photo_id],
        )
        .map_err(|e| format!("Failed to update favorite: {}", e))?;
    }
    tx.commit()
        .map_err(|e| format!("Failed to commit favorite batch: {}", e))?;
    Ok(())
}

pub fn set_photos_hidden_batch(
    conn: &mut Connection,
    photo_ids: &[String],
    hidden: bool,
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    let value: Option<String> = if hidden { Some(now) } else { None };
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;
    for photo_id in photo_ids {
        tx.execute(
            "UPDATE photos SET hidden_at = ?1 WHERE id = ?2",
            params![value, photo_id],
        )
        .map_err(|e| format!("Failed to update hidden: {}", e))?;
    }
    tx.commit()
        .map_err(|e| format!("Failed to commit hidden batch: {}", e))?;
    Ok(())
}

/// Add each tag in `tags` to every photo in `photo_ids` (idempotent — existing
/// links are skipped via INSERT OR IGNORE). Does not remove existing tags.
pub fn add_tags_to_photos_batch(
    conn: &mut Connection,
    photo_ids: &[String],
    tags: &[String],
) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;
    for tag in tags {
        let tag_name = tag.trim();
        if tag_name.is_empty() {
            continue;
        }
        let tag_id = upsert_tag(&tx, tag_name, "manual", "user", "user")?;
        for photo_id in photo_ids {
            upsert_photo_tag_source(&tx, photo_id, &tag_id, "user", None, None, "active")?;
        }
    }
    tx.commit()
        .map_err(|e| format!("Failed to commit tag batch: {}", e))?;
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

    Ok(FilterOptions {
        cameras,
        extensions,
        date_min,
        date_max,
    })
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

    let normalized = folder_path
        .map(normalize_relative_path)
        .filter(|p| !p.is_empty());

    if let Some(sid) = source_id {
        pv.push(rusqlite::types::Value::Text(sid.to_string()));
        where_parts.push(format!("p.source_id = ?{}", pv.len()));
    }
    if let Some(fp) = &normalized {
        pv.push(rusqlite::types::Value::Text(fp.clone()));
        where_parts.push(format!("p.relative_path LIKE (?{} || '/%')", pv.len()));
    }
    if !cameras.is_empty() {
        let phs: Vec<String> = cameras
            .iter()
            .map(|c| {
                pv.push(rusqlite::types::Value::Text(c.clone()));
                format!("?{}", pv.len())
            })
            .collect();
        where_parts.push(format!(
            "NULLIF(TRIM(COALESCE(p.camera_make,'') || ' ' || COALESCE(p.camera_model,'')), '') IN ({})",
            phs.join(", ")
        ));
    }
    if let Some(df) = date_from {
        pv.push(rusqlite::types::Value::Text(df.to_string()));
        where_parts.push(format!(
            "COALESCE(date(p.captured_at), date(p.file_mtime,'unixepoch')) >= ?{}",
            pv.len()
        ));
    }
    if let Some(dt) = date_to {
        pv.push(rusqlite::types::Value::Text(dt.to_string()));
        where_parts.push(format!(
            "COALESCE(date(p.captured_at), date(p.file_mtime,'unixepoch')) <= ?{}",
            pv.len()
        ));
    }
    if !extensions.is_empty() {
        let phs: Vec<String> = extensions
            .iter()
            .map(|e| {
                pv.push(rusqlite::types::Value::Text(e.to_lowercase()));
                format!("?{}", pv.len())
            })
            .collect();
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

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Failed to prepare filtered query: {}", e))?;
    let photos = stmt
        .query_map(
            rusqlite::params_from_iter(pv.iter()),
            timeline_photo_from_row,
        )
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
    Ok(Album {
        id,
        name: name.to_string(),
        photo_count: 0,
        created_at: now,
    })
}

pub fn delete_album(conn: &Connection, album_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM album_photos WHERE album_id = ?1",
        params![album_id],
    )
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
        .query_map([], |row| {
            Ok(Album {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
                photo_count: row.get(3)?,
            })
        })
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

pub fn remove_photo_from_album(
    conn: &Connection,
    album_id: &str,
    photo_id: &str,
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM album_photos WHERE album_id = ?1 AND photo_id = ?2",
        params![album_id, photo_id],
    )
    .map_err(|e| format!("Failed to remove photo from album: {}", e))?;
    Ok(())
}

pub fn add_photos_to_album_batch(
    conn: &mut Connection,
    album_id: &str,
    photo_ids: &[String],
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;
    for photo_id in photo_ids {
        tx.execute(
            "INSERT OR IGNORE INTO album_photos (album_id, photo_id, added_at) VALUES (?1, ?2, ?3)",
            params![album_id, photo_id, now],
        )
        .map_err(|e| format!("Failed to add photo to album: {}", e))?;
    }
    tx.commit()
        .map_err(|e| format!("Failed to commit batch: {}", e))?;
    Ok(())
}

pub fn remove_photos_from_album_batch(
    conn: &mut Connection,
    album_id: &str,
    photo_ids: &[String],
) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;
    for photo_id in photo_ids {
        tx.execute(
            "DELETE FROM album_photos WHERE album_id = ?1 AND photo_id = ?2",
            params![album_id, photo_id],
        )
        .map_err(|e| format!("Failed to remove photo from album: {}", e))?;
    }
    tx.commit()
        .map_err(|e| format!("Failed to commit batch: {}", e))?;
    Ok(())
}

/// Delete a source and all dependent rows (album_photos, photo_tags,
/// photo_assets, photos). Caller is responsible for any on-disk cleanup
/// (thumbnails directory) after this returns.
pub fn delete_source(conn: &mut Connection, source_id: &str) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;
    tx.execute(
        "DELETE FROM album_photos WHERE photo_id IN (SELECT id FROM photos WHERE source_id = ?1)",
        params![source_id],
    )
    .map_err(|e| format!("Failed to delete album_photos for source: {}", e))?;
    tx.execute(
        "DELETE FROM photo_tag_sources WHERE photo_id IN (SELECT id FROM photos WHERE source_id = ?1)",
        params![source_id],
    )
    .map_err(|e| format!("Failed to delete photo_tag_sources for source: {}", e))?;
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
    tx.execute(
        "DELETE FROM photos WHERE source_id = ?1",
        params![source_id],
    )
    .map_err(|e| format!("Failed to delete photos for source: {}", e))?;
    tx.execute("DELETE FROM sources WHERE id = ?1", params![source_id])
        .map_err(|e| format!("Failed to delete source: {}", e))?;
    tx.commit()
        .map_err(|e| format!("Failed to commit source deletion: {}", e))?;
    Ok(())
}

pub fn get_album_photos(
    conn: &Connection,
    album_id: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<TimelinePhoto>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {cols} \
             FROM photos p \
             INNER JOIN sources s ON p.source_id = s.id \
             INNER JOIN photo_assets pa ON p.id = pa.photo_id \
             INNER JOIN album_photos ap ON p.id = ap.photo_id \
             WHERE {asset} AND p.hidden_at IS NULL AND ap.album_id = ?3 \
             ORDER BY ap.added_at DESC LIMIT ?1 OFFSET ?2",
            cols = PHOTO_COLS,
            asset = ASSET_READY_COND
        ))
        .map_err(|e| format!("Failed to prepare album photos query: {}", e))?;
    let photos = stmt
        .query_map(params![limit, offset, album_id], timeline_photo_from_row)
        .map_err(|e| format!("Failed to query album photos: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect album photos: {}", e))?;
    Ok(photos)
}

pub fn get_photos_by_person(
    conn: &Connection,
    person_id: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<TimelinePhoto>, String> {
    // EXISTS over the faces table avoids the multi-row JOIN expansion that
    // SELECT DISTINCT would have to dedupe. SQLite's planner can also
    // short-circuit on the first matching face per photo when faces has
    // an index on (person_id, photo_id). Result set is the photo, not
    // (photo, face) cartesian product.
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {cols} \
             FROM photos p \
             INNER JOIN sources s ON p.source_id = s.id \
             INNER JOIN photo_assets pa ON p.id = pa.photo_id \
             WHERE {asset} AND p.hidden_at IS NULL \
               AND EXISTS ( \
                 SELECT 1 FROM faces f \
                 WHERE f.photo_id = p.id \
                   AND f.status = 'active' \
                   AND f.person_id = ?3 \
               ) \
             ORDER BY p.captured_at DESC, p.created_at DESC \
             LIMIT ?1 OFFSET ?2",
            cols = PHOTO_COLS,
            asset = ASSET_READY_COND
        ))
        .map_err(|e| format!("Failed to prepare person photos query: {}", e))?;
    let photos = stmt
        .query_map(params![limit, offset, person_id], timeline_photo_from_row)
        .map_err(|e| format!("Failed to query person photos: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect person photos: {}", e))?;
    Ok(photos)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn open_memory() -> Connection {
        Connection::open_in_memory().expect("open in-memory sqlite")
    }

    fn table_exists(conn: &Connection, name: &str) -> bool {
        conn.query_row(
            "SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name = ?1",
            params![name],
            |_| Ok(()),
        )
        .is_ok()
    }

    fn current_version(conn: &Connection) -> i32 {
        conn.query_row("SELECT version FROM schema_version", [], |row| row.get(0))
            .expect("read schema_version")
    }

    #[test]
    fn fresh_initialize_creates_v13_capability_task_and_label_layer_tables() {
        let conn = open_memory();
        initialize_schema(&conn).expect("initialize schema");

        assert_eq!(current_version(&conn), SCHEMA_VERSION);
        for table in [
            "analysis_jobs",
            "analysis_events",
            "analysis_results",
            "faces",
            "persons",
            "photo_faces",
            "background_tasks",
        ] {
            assert!(table_exists(&conn, table), "missing table {}", table);
        }
    }

    #[test]
    fn migrate_from_v6_adds_capability_tables_and_keeps_existing_rows() {
        let conn = open_memory();
        // Build a minimal v6-shaped database: schema_version row + a sources / photos row.
        conn.execute_batch(
            r#"
            CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
            CREATE TABLE sources (
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
            CREATE TABLE photos (
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
            INSERT INTO schema_version (version) VALUES (6);
            INSERT INTO sources (id, name, root_path, source_type, status, created_at, updated_at)
            VALUES ('src-1', 'Test', '/tmp/src', 'local', 'online', '2026-05-27', '2026-05-27');
            INSERT INTO photos
              (id, source_id, relative_path, absolute_path_snapshot, file_name, extension,
               file_size, file_mtime, status, created_at, updated_at)
            VALUES
              ('p-1', 'src-1', 'a.jpg', '/tmp/src/a.jpg', 'a.jpg', 'jpg',
               1024, 0, 'indexed', '2026-05-27', '2026-05-27');
            "#,
        )
        .expect("seed v6 schema");

        migrate_schema(&conn).expect("migrate schema to latest");

        assert_eq!(current_version(&conn), SCHEMA_VERSION);
        for table in [
            "analysis_jobs",
            "analysis_events",
            "analysis_results",
            "faces",
            "persons",
            "photo_faces",
            "background_tasks",
        ] {
            assert!(table_exists(&conn, table), "missing table {}", table);
        }

        // Pre-existing photo row preserved.
        let photo_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM photos", [], |row| row.get(0))
            .expect("count photos");
        assert_eq!(photo_count, 1);
    }

    #[test]
    fn migrate_is_idempotent() {
        let conn = open_memory();
        initialize_schema(&conn).expect("initialize schema");
        migrate_schema(&conn).expect("first migrate");
        migrate_schema(&conn).expect("second migrate is a no-op");
        assert_eq!(current_version(&conn), SCHEMA_VERSION);
    }


    #[test]
    fn manual_tags_use_unified_tag_layer_metadata() {
        let conn = open_memory();
        initialize_schema(&conn).expect("initialize schema");
        conn.execute(
            "INSERT INTO sources (id, name, root_path, source_type, status, created_at, updated_at) \
             VALUES ('s', 't', '/x', 'local', 'online', 'now', 'now')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO photos (id, source_id, relative_path, absolute_path_snapshot, file_name, \
             extension, file_size, file_mtime, fingerprint, status, created_at, updated_at) \
             VALUES ('p', 's', 'a.jpg', '/x/a.jpg', 'a.jpg', 'jpg', 1, 1, '1:1', 'indexed', 'now', 'now')",
            [],
        )
        .unwrap();

        let tags = set_photo_tags(&conn, "p", &["  Travel  ".to_string()]).unwrap();
        assert_eq!(tags, vec!["Travel".to_string()]);

        let row: (String, String, String, String) = conn
            .query_row(
                "SELECT canonical_name, kind, visibility, created_by FROM tags WHERE name = 'Travel'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!(row, ("travel".into(), "manual".into(), "user".into(), "user".into()));

        let source_row: (String, String) = conn
            .query_row(
                "SELECT source, status FROM photo_tag_sources pts \
                 INNER JOIN tags t ON t.id = pts.tag_id WHERE pts.photo_id = 'p' AND t.name = 'Travel'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(source_row, ("user".into(), "active".into()));
    }

    #[test]
    fn system_tags_do_not_pollute_manual_tag_lists() {
        let conn = open_memory();
        initialize_schema(&conn).expect("initialize schema");
        conn.execute(
            "INSERT INTO sources (id, name, root_path, source_type, status, created_at, updated_at) \
             VALUES ('s', 't', '/x', 'local', 'online', 'now', 'now')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO photos (id, source_id, relative_path, absolute_path_snapshot, file_name, \
             extension, file_size, file_mtime, fingerprint, status, created_at, updated_at) \
             VALUES ('p', 's', 'a.jpg', '/x/a.jpg', 'a.jpg', 'jpg', 1, 1, '1:1', 'indexed', 'now', 'now')",
            [],
        )
        .unwrap();

        set_photo_tags(&conn, "p", &["Manual".to_string()]).unwrap();
        let system_id = upsert_tag(&conn, "Camera", "subject", "system", "rule").unwrap();
        upsert_photo_tag_source(&conn, "p", &system_id, "rule", Some(0.9), Some("{\"rule\":\"test\"}"), "active").unwrap();

        assert_eq!(get_photo_tags(&conn, "p").unwrap(), vec!["Manual".to_string()]);
        let all = get_all_tags(&conn).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].name, "Manual");
    }

    #[test]
    fn rejected_tag_source_is_removed_from_active_projection() {
        let conn = open_memory();
        initialize_schema(&conn).expect("initialize schema");
        conn.execute(
            "INSERT INTO sources (id, name, root_path, source_type, status, created_at, updated_at) \
             VALUES ('s', 't', '/x', 'local', 'online', 'now', 'now')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO photos (id, source_id, relative_path, absolute_path_snapshot, file_name, \
             extension, file_size, file_mtime, fingerprint, status, created_at, updated_at) \
             VALUES ('p', 's', 'a.jpg', '/x/a.jpg', 'a.jpg', 'jpg', 1, 1, '1:1', 'indexed', 'now', 'now')",
            [],
        )
        .unwrap();

        let tag_id = upsert_tag(&conn, "Maybe", "subject", "system", "rule").unwrap();
        upsert_photo_tag_source(&conn, "p", &tag_id, "rule", Some(0.5), None, "active").unwrap();
        let projected: i64 = conn
            .query_row("SELECT COUNT(*) FROM photo_tags WHERE photo_id = 'p' AND tag_id = ?1", params![tag_id], |r| r.get(0))
            .unwrap();
        assert_eq!(projected, 1);

        upsert_photo_tag_source(&conn, "p", &tag_id, "rule", Some(0.5), None, "rejected").unwrap();
        let projected: i64 = conn
            .query_row("SELECT COUNT(*) FROM photo_tags WHERE photo_id = 'p' AND tag_id = ?1", params![tag_id], |r| r.get(0))
            .unwrap();
        assert_eq!(projected, 0);
    }



    #[test]
    fn migrate_v12_drops_global_tag_name_uniqueness_for_label_kinds() {
        let conn = open_memory();
        conn.execute_batch(
            r#"
            CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
            INSERT INTO schema_version (version) VALUES (12);
            CREATE TABLE tags (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                canonical_name TEXT,
                kind TEXT NOT NULL DEFAULT 'manual',
                visibility TEXT NOT NULL DEFAULT 'user',
                created_by TEXT NOT NULL DEFAULT 'user',
                created_at TEXT NOT NULL,
                updated_at TEXT
            );
            INSERT INTO tags (id, name, canonical_name, kind, visibility, created_by, created_at, updated_at)
            VALUES ('manual-alice', 'Alice', 'alice', 'manual', 'user', 'user', 'now', 'now');
            "#,
        )
        .unwrap();

        initialize_schema(&conn).expect("migrate schema");
        let person_id = upsert_semantic_tag(&conn, "Alice", "person", "person:alice", "system", "face.cluster")
            .expect("same display name can exist in another label kind");
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tags WHERE name = 'Alice' COLLATE NOCASE", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 2);
        assert_ne!(person_id, "manual-alice");
    }

    #[test]
    fn person_labels_sync_to_unified_label_projection() {
        let conn = open_memory();
        initialize_schema(&conn).expect("initialize schema");
        conn.execute(
            "INSERT INTO sources (id, name, root_path, source_type, status, created_at, updated_at) \
             VALUES ('s', 't', '/x', 'local', 'online', 'now', 'now')",
            [],
        )
        .unwrap();
        for photo_id in ["p1", "p2"] {
            conn.execute(
                "INSERT INTO photos (id, source_id, relative_path, absolute_path_snapshot, file_name, \
                 extension, file_size, file_mtime, fingerprint, status, created_at, updated_at) \
                 VALUES (?1, 's', ?2, ?3, ?2, 'jpg', 1, 1, ?1, 'indexed', 'now', 'now')",
                params![photo_id, format!("{}.jpg", photo_id), format!("/x/{}.jpg", photo_id)],
            )
            .unwrap();
        }
        conn.execute(
            "INSERT INTO persons (id, display_name, rep_face_id, cluster_method, face_count, is_hidden, merged_into, created_at, updated_at) \
             VALUES ('person-a', 'Alice', 'f1', 'hnsw.v1', 2, 0, NULL, 'now', 'now')",
            [],
        )
        .unwrap();
        for (face_id, photo_id, confidence) in [("f1", "p1", 0.91), ("f2", "p2", 0.82)] {
            conn.execute(
                "INSERT INTO faces (id, photo_id, detected_by, bbox_x, bbox_y, bbox_w, bbox_h, confidence, person_id, status, created_at) \
                 VALUES (?1, ?2, 'vision', 0.1, 0.1, 0.2, 0.2, ?3, 'person-a', 'active', 'now')",
                params![face_id, photo_id, confidence],
            )
            .unwrap();
        }

        let tag_id = sync_person_label(&conn, "person-a").unwrap().unwrap();
        let tag_row: (String, String, String, String) = conn
            .query_row(
                "SELECT name, kind, semantic_key, visibility FROM tags WHERE id = ?1",
                params![tag_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!(tag_row, ("Alice".into(), "person".into(), "person:person-a".into(), "system".into()));

        let projected: i64 = conn
            .query_row("SELECT COUNT(*) FROM photo_tags WHERE tag_id = ?1", params![tag_id], |r| r.get(0))
            .unwrap();
        assert_eq!(projected, 2);
        assert_eq!(get_photo_tags(&conn, "p1").unwrap(), Vec::<String>::new());

        let labels = get_labels(&conn, Some("person")).unwrap();
        assert_eq!(labels.len(), 1);
        assert_eq!(labels[0].name, "Alice");
        assert_eq!(labels[0].photo_count, 2);
    }

    #[test]
    fn person_label_rename_reuses_semantic_tag() {
        let conn = open_memory();
        initialize_schema(&conn).expect("initialize schema");
        conn.execute(
            "INSERT INTO persons (id, display_name, rep_face_id, cluster_method, face_count, is_hidden, merged_into, created_at, updated_at) \
             VALUES ('person-a', NULL, NULL, 'hnsw.v1', 0, 0, NULL, 'now', 'now')",
            [],
        )
        .unwrap();
        let first = sync_person_label(&conn, "person-a").unwrap().unwrap();
        conn.execute("UPDATE persons SET display_name = 'Alice' WHERE id = 'person-a'", []).unwrap();
        let second = sync_person_label(&conn, "person-a").unwrap().unwrap();
        assert_eq!(first, second);
        let row: (String, String) = conn
            .query_row("SELECT name, created_by FROM tags WHERE id = ?1", params![first], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!(row, ("Alice".into(), "user".into()));
    }


    #[test]
    fn content_classification_results_materialize_subject_labels() {
        let conn = open_memory();
        initialize_schema(&conn).expect("initialize schema");
        conn.execute(
            "INSERT INTO sources (id, name, root_path, source_type, status, created_at, updated_at) \
             VALUES ('s', 't', '/x', 'local', 'online', 'now', 'now')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO photos (id, source_id, relative_path, absolute_path_snapshot, file_name, \
             extension, file_size, file_mtime, fingerprint, status, created_at, updated_at) \
             VALUES ('p', 's', 'a.jpg', '/x/a.jpg', 'a.jpg', 'jpg', 1, 1, '1:1', 'indexed', 'now', 'now')",
            [],
        )
        .unwrap();
        set_photo_tags(&conn, "p", &["Cat".to_string()]).unwrap();
        conn.execute(
            "INSERT INTO analysis_results \
             (photo_id, capability, provider_id, schema_version, result_json, confidence, job_id, generated_at) \
             VALUES ('p', 'content.classify', 'macos.vision.classify.v1', 1, ?1, 0.93, NULL, 'now')",
            params![serde_json::json!({
                "labels": [
                    {"identifier": "cat", "confidence": 0.93},
                    {"identifier": "outdoor_scene", "confidence": 0.42},
                    {"identifier": "noise", "confidence": 0.1}
                ]
            }).to_string()],
        )
        .unwrap();

        let (photos, labels) = materialize_content_classification_results(&conn, 0.35, None).unwrap();
        assert_eq!((photos, labels), (1, 2));

        let subjects = get_labels(&conn, Some("subject")).unwrap();
        assert_eq!(subjects.len(), 2);
        assert!(subjects.iter().any(|label| label.name == "Cat" && label.kind == "subject"));
        assert!(subjects.iter().any(|label| label.name == "Outdoor Scene"));
        assert_eq!(get_photo_tags(&conn, "p").unwrap(), vec!["Cat".to_string()]);

        let subject_cat_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tags WHERE name = 'Cat' COLLATE NOCASE AND kind = 'subject'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(subject_cat_count, 1);
    }

    #[test]
    fn analysis_results_pk_blocks_duplicates() {
        let conn = open_memory();
        initialize_schema(&conn).expect("initialize schema");
        conn.execute(
            "INSERT INTO sources (id, name, root_path, source_type, status, created_at, updated_at) \
             VALUES ('s', 't', '/x', 'local', 'online', 'now', 'now')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO photos (id, source_id, relative_path, absolute_path_snapshot, file_name, \
             extension, file_size, file_mtime, status, created_at, updated_at) \
             VALUES ('p', 's', 'a.jpg', '/x/a.jpg', 'a.jpg', 'jpg', 1, 0, 'indexed', 'now', 'now')",
            [],
        )
        .unwrap();

        let insert = "INSERT INTO analysis_results \
             (photo_id, capability, provider_id, schema_version, result_json, generated_at) \
             VALUES ('p', 'face.detect', 'macos.vision.v1', 1, '{}', 'now')";
        conn.execute(insert, []).expect("first insert");
        let dup = conn.execute(insert, []);
        assert!(dup.is_err(), "duplicate key should fail");
    }
}
