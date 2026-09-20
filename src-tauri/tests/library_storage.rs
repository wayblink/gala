use gala_lib::library::apple_photos::{ApplePhotoAlbum, ApplePhotoAsset};
use gala_lib::library::scanner::discover_photos;
use gala_lib::library::storage::{
    delete_source, get_favorite_photos, get_hidden_photos, get_library_summary, get_photo_tags,
    get_source_collection_photos, get_source_collections, get_source_folders, get_timeline_photos,
    get_timeline_photos_with_variant_mode, initialize_schema, migrate_schema, open_database,
    rename_source, replace_source_photos, reuse_logical_photo_assets, search_photos,
    set_photo_tags, source_status_for_path, sync_apple_photos_collections, update_photo_dimensions,
    update_photo_exif_metadata, upsert_apple_photos_source, upsert_photo_assets, upsert_source,
};
use rusqlite::params;
use std::fs;
use tempfile::TempDir;

#[test]
fn test_source_status_reflects_current_local_availability() {
    let temp_dir = TempDir::new().unwrap();
    assert_eq!(
        source_status_for_path("local_folder", temp_dir.path().to_str().unwrap()),
        "online"
    );

    let missing = temp_dir.path().join("missing");
    assert_eq!(
        source_status_for_path("local_folder", missing.to_str().unwrap()),
        "missing"
    );
    assert_eq!(
        source_status_for_path("local_folder", "/Volumes/ejected-gala-test"),
        "offline"
    );
}

#[test]
fn test_same_stem_variants_share_logical_id_only_inside_the_same_folder() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let source_path = temp_dir.path().join("photos");
    fs::create_dir_all(source_path.join("a")).unwrap();
    fs::create_dir_all(source_path.join("b")).unwrap();
    fs::write(source_path.join("a/DSC00597.ARW"), b"raw").unwrap();
    fs::write(source_path.join("a/DSC00597.JPG"), b"jpeg").unwrap();
    fs::write(source_path.join("b/DSC00597.JPG"), b"jpeg").unwrap();

    let mut conn = open_database(&db_path).unwrap();
    initialize_schema(&conn).unwrap();
    migrate_schema(&conn).unwrap();
    let source = upsert_source(&conn, &source_path).unwrap();
    let discovered = discover_photos(&source_path).unwrap();
    replace_source_photos(&mut conn, &source.id, &source_path, &discovered).unwrap();

    let mut stmt = conn
        .prepare("SELECT relative_path, logical_id FROM photos ORDER BY relative_path")
        .unwrap();
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();

    assert_eq!(rows[0].1, rows[1].1);
    assert!(rows[0].1.is_some());
    assert_ne!(rows[1].1, rows[2].1);
}

#[test]
fn test_timeline_can_merge_or_separate_same_photo_variants() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let source_path = temp_dir.path().join("photos");
    fs::create_dir(&source_path).unwrap();
    fs::write(source_path.join("DSC00597.ARW"), b"raw").unwrap();
    fs::write(source_path.join("DSC00597.JPG"), b"jpeg").unwrap();

    let mut conn = open_database(&db_path).unwrap();
    initialize_schema(&conn).unwrap();
    migrate_schema(&conn).unwrap();
    let source = upsert_source(&conn, &source_path).unwrap();
    let discovered = discover_photos(&source_path).unwrap();
    let upserted = replace_source_photos(&mut conn, &source.id, &source_path, &discovered).unwrap();
    for photo in &upserted {
        upsert_photo_assets(
            &conn,
            &photo.id,
            "/tmp/shared-small.jpg",
            "/tmp/shared-medium.jpg",
            "/tmp/shared-large.jpg",
        )
        .unwrap();
    }

    let merged = get_timeline_photos_with_variant_mode(&conn, 20, 0, None, None, true).unwrap();
    let separate = get_timeline_photos_with_variant_mode(&conn, 20, 0, None, None, false).unwrap();

    assert_eq!(merged.len(), 1);
    assert_eq!(merged[0].file_name, "DSC00597.JPG");
    assert_eq!(merged[0].variants.len(), 2);
    assert_eq!(
        merged[0]
            .variants
            .iter()
            .map(|v| v.format_kind.as_str())
            .collect::<Vec<_>>(),
        vec!["raw", "jpeg"]
    );
    assert_eq!(separate.len(), 2);
    assert!(separate.iter().all(|photo| photo.variants.len() == 2));
}

#[test]
fn test_photo_variant_can_reuse_ready_thumbnail_paths() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let source_path = temp_dir.path().join("photos");
    fs::create_dir(&source_path).unwrap();
    fs::write(source_path.join("DSC00597.ARW"), b"raw").unwrap();
    fs::write(source_path.join("DSC00597.JPG"), b"jpeg").unwrap();

    let mut conn = open_database(&db_path).unwrap();
    initialize_schema(&conn).unwrap();
    migrate_schema(&conn).unwrap();
    let source = upsert_source(&conn, &source_path).unwrap();
    let discovered = discover_photos(&source_path).unwrap();
    let upserted = replace_source_photos(&mut conn, &source.id, &source_path, &discovered).unwrap();
    let jpeg = upserted
        .iter()
        .find(|photo| photo.extension == "jpg")
        .unwrap();
    let raw = upserted
        .iter()
        .find(|photo| photo.extension == "arw")
        .unwrap();
    upsert_photo_assets(
        &conn,
        &jpeg.id,
        "/cache/s.jpg",
        "/cache/m.jpg",
        "/cache/l.jpg",
    )
    .unwrap();

    let reused =
        reuse_logical_photo_assets(&conn, &raw.id, raw.logical_id.as_deref().unwrap()).unwrap();

    assert!(reused);
    let paths: (String, String, String) = conn.query_row(
        "SELECT thumbnail_small_path, thumbnail_medium_path, thumbnail_large_path FROM photo_assets WHERE photo_id = ?1",
        [&raw.id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).unwrap();
    assert_eq!(
        paths,
        (
            "/cache/s.jpg".into(),
            "/cache/m.jpg".into(),
            "/cache/l.jpg".into()
        )
    );
}

#[test]
fn test_delete_source_removes_all_source_rows_and_rejects_missing_source() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let mut conn = open_database(&db_path).unwrap();
    initialize_schema(&conn).unwrap();
    let source = upsert_source(&conn, temp_dir.path()).unwrap();
    let photo_id = "photo-delete-test";
    conn.execute(
        "INSERT INTO photos (id, source_id, relative_path, absolute_path_snapshot, file_name, extension, file_size, file_mtime, fingerprint, status, created_at, updated_at) VALUES (?1, ?2, 'x.jpg', 'x.jpg', 'x.jpg', 'jpg', 1, 1, '', 'indexed', 'now', 'now')",
        params![photo_id, source.id],
    ).unwrap();
    conn.execute(
        "INSERT INTO photo_assets (photo_id, asset_status) VALUES (?1, 'ready')",
        params![photo_id],
    )
    .unwrap();
    conn.execute("INSERT INTO photo_embeddings (photo_id, model_name, embedding_path, dimensions, generated_at) VALUES (?1, 'test', 'x', 1, 'now')", params![photo_id]).unwrap();
    conn.execute("INSERT INTO analysis_results (photo_id, capability, provider_id, schema_version, result_json, generated_at) VALUES (?1, 'test', 'test', 1, '{}', 'now')", params![photo_id]).unwrap();
    conn.execute("INSERT INTO faces (id, photo_id, detected_by, bbox_x, bbox_y, bbox_w, bbox_h, confidence, status, created_at) VALUES ('face-delete-test', ?1, 'test', 0, 0, 1, 1, 1, 'active', 'now')", params![photo_id]).unwrap();
    conn.execute(
        "INSERT INTO photo_faces (photo_id, face_id) VALUES (?1, 'face-delete-test')",
        params![photo_id],
    )
    .unwrap();

    delete_source(&mut conn, &source.id).unwrap();
    for table in [
        "sources",
        "photos",
        "photo_assets",
        "photo_embeddings",
        "analysis_results",
        "faces",
        "photo_faces",
    ] {
        let count: i64 = conn
            .query_row(&format!("SELECT COUNT(*) FROM {}", table), [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0, "table {} should be empty", table);
    }
    let error = delete_source(&mut conn, &source.id).unwrap_err();
    assert!(error.contains("Source not found"));
}

#[test]
fn test_indexes_apple_photos_as_a_distinct_read_only_source() {
    let mut conn = rusqlite::Connection::open_in_memory().unwrap();
    initialize_schema(&conn).unwrap();
    let assets = vec![ApplePhotoAsset {
        local_identifier: "asset-1/L0/001".to_string(),
        file_name: "Photos asset 1".to_string(),
        captured_at: Some("2026-01-02T03:04:05Z".to_string()),
        width: 4032,
        height: 3024,
        is_favorite: true,
        is_hidden: false,
    }];

    let source = upsert_apple_photos_source(&mut conn, &assets).unwrap();
    assert_eq!(source.source_kind, "apple_photos");
    assert_eq!(source.root_path, "apple-photos://library");
    assert_eq!(source.photo_count, 1);
    sync_apple_photos_collections(
        &mut conn,
        &source.id,
        &[ApplePhotoAlbum {
            local_identifier: "album-1".to_string(),
            title: "Trip".to_string(),
            asset_local_identifiers: vec!["asset-1/L0/001".to_string()],
        }],
    )
    .unwrap();
    let collections = get_source_collections(&conn, &source.id).unwrap();
    assert_eq!(collections.len(), 1);
    assert_eq!(collections[0].name, "Trip");
    assert_eq!(
        get_source_collection_photos(&conn, &collections[0].id, 10, 0)
            .unwrap()
            .len(),
        1
    );

    let summary = get_library_summary(&conn).unwrap();
    assert_eq!(summary.sources[0].source_kind, "apple_photos");
    assert_eq!(summary.total_photos, 1);
    let provider_roots = get_source_folders(&conn).unwrap();
    assert_eq!(provider_roots.len(), 1);
    assert_eq!(provider_roots[0].name, "Apple Photos");
    assert_eq!(provider_roots[0].folder_path, "");
    assert_eq!(provider_roots[0].photo_count, 1);

    let rows = get_timeline_photos(&conn, 10, 0, None, None).unwrap();
    assert_eq!(rows[0].id, "apple-photos:asset-1/L0/001");
    assert!(rows[0].is_favorite);
    assert_eq!(rows[0].width, Some(4032));
    assert_eq!(
        get_favorite_photos(&conn, 10, 0, Some(&source.id))
            .unwrap()
            .len(),
        1
    );
    assert!(get_favorite_photos(&conn, 10, 0, Some("another-source"))
        .unwrap()
        .is_empty());
    assert!(get_hidden_photos(&conn, 10, 0, Some(&source.id))
        .unwrap()
        .is_empty());
    assert_eq!(
        rename_source(&conn, &source.id, "Renamed Photos").unwrap_err(),
        "Apple Photos source name is fixed"
    );
}

#[test]
fn test_initializes_schema() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");

    let conn = open_database(&db_path).unwrap();
    initialize_schema(&conn).unwrap();

    let table_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('sources', 'photos', 'schema_version')",
            [],
            |row| row.get(0),
        )
        .unwrap();

    assert_eq!(table_count, 3);

    let photo_columns: Vec<String> = conn
        .prepare("PRAGMA table_info(photos)")
        .unwrap()
        .query_map([], |row| row.get::<_, String>(1))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();

    assert!(photo_columns.contains(&"favorited_at".to_string()));
    assert!(photo_columns.contains(&"width".to_string()));
    assert!(photo_columns.contains(&"height".to_string()));
    assert!(photo_columns.contains(&"captured_at".to_string()));
    assert!(photo_columns.contains(&"camera_make".to_string()));
    assert!(photo_columns.contains(&"camera_model".to_string()));
    assert!(photo_columns.contains(&"lens_model".to_string()));
    assert!(photo_columns.contains(&"gps_latitude".to_string()));
    assert!(photo_columns.contains(&"gps_longitude".to_string()));
    assert!(photo_columns.contains(&"content_hash".to_string()));
    assert!(photo_columns.contains(&"fingerprint".to_string()));
    assert!(photo_columns.contains(&"logical_id".to_string()));

    let content_hash_index: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_photos_content_hash'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(content_hash_index, 1);

    let photo_tag_sources_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='photo_tag_sources'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(photo_tag_sources_count, 1);
}

#[test]
fn test_migrates_legacy_v3_schema_missing_exif_columns() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");

    let conn = open_database(&db_path).unwrap();
    conn.execute_batch(
        r#"
        CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
        INSERT INTO schema_version (version) VALUES (3);

        CREATE TABLE photos (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            absolute_path_snapshot TEXT NOT NULL,
            file_name TEXT NOT NULL,
            extension TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            file_mtime INTEGER NOT NULL,
            width INTEGER,
            height INTEGER,
            status TEXT NOT NULL,
            favorited_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        "#,
    )
    .unwrap();

    migrate_schema(&conn).unwrap();

    let photo_columns: Vec<String> = conn
        .prepare("PRAGMA table_info(photos)")
        .unwrap()
        .query_map([], |row| row.get::<_, String>(1))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();

    assert!(photo_columns.contains(&"captured_at".to_string()));
    assert!(photo_columns.contains(&"camera_make".to_string()));
    assert!(photo_columns.contains(&"camera_model".to_string()));
    assert!(photo_columns.contains(&"lens_model".to_string()));
    assert!(photo_columns.contains(&"gps_latitude".to_string()));
    assert!(photo_columns.contains(&"gps_longitude".to_string()));
    assert!(photo_columns.contains(&"content_hash".to_string()));
    assert!(photo_columns.contains(&"fingerprint".to_string()));
    assert!(photo_columns.contains(&"logical_id".to_string()));
}

#[test]
fn test_migration_backfills_fingerprint_for_existing_rows() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");

    let conn = open_database(&db_path).unwrap();
    conn.execute_batch(
        r#"
        CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
        INSERT INTO schema_version (version) VALUES (7);

        CREATE TABLE photos (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            absolute_path_snapshot TEXT NOT NULL,
            file_name TEXT NOT NULL,
            extension TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            file_mtime INTEGER NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        INSERT INTO photos
          (id, source_id, relative_path, absolute_path_snapshot, file_name, extension,
           file_size, file_mtime, status, created_at, updated_at)
        VALUES
          ('p-1', 'src-1', 'a.jpg', '/tmp/src/a.jpg', 'a.jpg', 'jpg',
           2048, 12345, 'indexed', '2026-05-28', '2026-05-28');
        "#,
    )
    .unwrap();

    migrate_schema(&conn).unwrap();

    let fingerprint: String = conn
        .query_row(
            "SELECT fingerprint FROM photos WHERE id = 'p-1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(fingerprint, "2048:12345");
}

#[test]
fn test_migrates_legacy_photo_tag_sources() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");

    let conn = open_database(&db_path).unwrap();
    conn.execute_batch(
        r#"
        CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
        INSERT INTO schema_version (version) VALUES (8);

        CREATE TABLE photos (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            absolute_path_snapshot TEXT NOT NULL,
            file_name TEXT NOT NULL,
            extension TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            file_mtime INTEGER NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            tag_type TEXT NOT NULL,
            confidence REAL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE photo_tags (
            photo_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            source TEXT NOT NULL,
            confidence REAL,
            created_at TEXT NOT NULL,
            PRIMARY KEY(photo_id, tag_id, source)
        );
        INSERT INTO photos
          (id, source_id, relative_path, absolute_path_snapshot, file_name, extension,
           file_size, file_mtime, status, created_at, updated_at)
        VALUES
          ('p-1', 'src-1', 'a.jpg', '/tmp/src/a.jpg', 'a.jpg', 'jpg',
           2048, 12345, 'indexed', '2026-05-28', '2026-05-28');
        INSERT INTO tags (id, name, tag_type, confidence, created_at)
        VALUES ('t-1', 'portrait', 'manual', NULL, '2026-05-28');
        INSERT INTO photo_tags (photo_id, tag_id, source, confidence, created_at)
        VALUES
          ('p-1', 't-1', 'manual', NULL, '2026-05-28T10:00:00Z'),
          ('p-1', 't-1', 'ai', 0.87, '2026-05-28T11:00:00Z');
        "#,
    )
    .unwrap();

    migrate_schema(&conn).unwrap();

    let photo_tag_columns: Vec<String> = conn
        .prepare("PRAGMA table_info(photo_tags)")
        .unwrap()
        .query_map([], |row| row.get::<_, String>(1))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert!(!photo_tag_columns.contains(&"source".to_string()));

    let link_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM photo_tags", [], |row| row.get(0))
        .unwrap();
    assert_eq!(link_count, 1);

    let sources: Vec<(String, Option<f64>)> = conn
        .prepare("SELECT source, confidence FROM photo_tag_sources ORDER BY source")
        .unwrap()
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(
        sources,
        vec![("ai".to_string(), Some(0.87)), ("manual".to_string(), None)]
    );
}

#[test]
fn test_upserts_one_source() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let source_path = temp_dir.path().join("photos");
    fs::create_dir(&source_path).unwrap();

    let conn = open_database(&db_path).unwrap();
    initialize_schema(&conn).unwrap();

    let source = upsert_source(&conn, &source_path).unwrap();

    assert!(!source.id.is_empty());
    assert_eq!(source.name, "photos");
    assert_eq!(source.status, "online");
    assert_eq!(source.photo_count, 0);

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM sources", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 1);
}

#[test]
fn test_inserts_discovered_photos_for_source() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let source_path = temp_dir.path().join("photos");
    fs::create_dir(&source_path).unwrap();
    fs::write(source_path.join("photo1.jpg"), b"fake").unwrap();
    fs::write(source_path.join("photo2.png"), b"fake").unwrap();

    let mut conn = open_database(&db_path).unwrap();
    initialize_schema(&conn).unwrap();
    migrate_schema(&conn).unwrap();

    let source = upsert_source(&conn, &source_path).unwrap();
    let photos = discover_photos(&source_path).unwrap();

    replace_source_photos(&mut conn, &source.id, &source_path, &photos).unwrap();

    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM photos WHERE source_id = ?1",
            [&source.id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 2);

    let fingerprints: Vec<(i64, i64, String)> = conn
        .prepare("SELECT file_size, file_mtime, fingerprint FROM photos ORDER BY file_name")
        .unwrap()
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(fingerprints.len(), 2);
    for (file_size, file_mtime, fingerprint) in fingerprints {
        assert_eq!(fingerprint, format!("{}:{}", file_size, file_mtime));
    }
}

#[test]
fn test_rescan_removes_previously_indexed_appledouble_files() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let source_path = temp_dir.path().join("photos");
    fs::create_dir(&source_path).unwrap();
    fs::write(source_path.join("photo.jpg"), b"fake photo").unwrap();
    fs::write(source_path.join("._photo.jpg"), b"appledouble metadata").unwrap();

    let mut conn = open_database(&db_path).unwrap();
    initialize_schema(&conn).unwrap();
    migrate_schema(&conn).unwrap();

    let source = upsert_source(&conn, &source_path).unwrap();
    conn.execute(
        "INSERT INTO photos \
            (id, source_id, relative_path, absolute_path_snapshot, file_name, extension, \
             file_size, file_mtime, fingerprint, status, created_at, updated_at) \
         VALUES ('appledouble-photo', ?1, '._photo.jpg', ?2, '._photo.jpg', 'jpg', \
                 20, 0, '20:0', 'indexed', 'now', 'now')",
        params![source.id, source_path.join("._photo.jpg").to_string_lossy()],
    )
    .unwrap();

    let photos = discover_photos(&source_path).unwrap();
    replace_source_photos(&mut conn, &source.id, &source_path, &photos).unwrap();

    let file_names = conn
        .prepare("SELECT file_name FROM photos WHERE source_id = ?1 ORDER BY file_name")
        .unwrap()
        .query_map([&source.id], |row| row.get::<_, String>(0))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(file_names, vec!["photo.jpg"]);
}

#[test]
fn test_set_photo_tags_keeps_non_manual_tag_sources() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let source_path = temp_dir.path().join("photos");
    fs::create_dir(&source_path).unwrap();
    fs::write(source_path.join("photo1.jpg"), b"fake").unwrap();

    let mut conn = open_database(&db_path).unwrap();
    initialize_schema(&conn).unwrap();
    migrate_schema(&conn).unwrap();

    let source = upsert_source(&conn, &source_path).unwrap();
    let photos = discover_photos(&source_path).unwrap();
    replace_source_photos(&mut conn, &source.id, &source_path, &photos).unwrap();

    let photo_id: String = conn
        .query_row("SELECT id FROM photos LIMIT 1", [], |row| row.get(0))
        .unwrap();

    set_photo_tags(&conn, &photo_id, &["portrait".to_string()]).unwrap();
    let tag_id: String = conn
        .query_row("SELECT id FROM tags WHERE name = 'portrait'", [], |row| {
            row.get(0)
        })
        .unwrap();
    conn.execute(
        "INSERT OR IGNORE INTO photo_tag_sources \
            (photo_id, tag_id, source, confidence, added_at) \
         VALUES (?1, ?2, 'ai', 0.82, '2026-05-28T12:00:00Z')",
        [&photo_id, &tag_id],
    )
    .unwrap();

    set_photo_tags(&conn, &photo_id, &[]).unwrap();

    assert_eq!(get_photo_tags(&conn, &photo_id).unwrap(), vec!["portrait"]);

    let sources: Vec<String> = conn
        .prepare("SELECT source FROM photo_tag_sources ORDER BY source")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(sources, vec!["ai".to_string()]);
}

#[test]
fn test_rescanning_same_source_updates_rows() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let source_path = temp_dir.path().join("photos");
    fs::create_dir(&source_path).unwrap();
    fs::write(source_path.join("photo1.jpg"), b"fake").unwrap();

    let mut conn = open_database(&db_path).unwrap();
    initialize_schema(&conn).unwrap();
    migrate_schema(&conn).unwrap();

    let source = upsert_source(&conn, &source_path).unwrap();
    let photos = discover_photos(&source_path).unwrap();
    replace_source_photos(&mut conn, &source.id, &source_path, &photos).unwrap();

    let count_before: i64 = conn
        .query_row("SELECT COUNT(*) FROM photos", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count_before, 1);

    fs::write(source_path.join("photo2.png"), b"fake").unwrap();
    let photos = discover_photos(&source_path).unwrap();
    replace_source_photos(&mut conn, &source.id, &source_path, &photos).unwrap();

    let count_after: i64 = conn
        .query_row("SELECT COUNT(*) FROM photos", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count_after, 2);
}

#[test]
fn test_summary_returns_total_photo_count_and_source_photo_count() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let source1_path = temp_dir.path().join("source1");
    let source2_path = temp_dir.path().join("source2");
    fs::create_dir(&source1_path).unwrap();
    fs::create_dir(&source2_path).unwrap();
    fs::write(source1_path.join("photo1.jpg"), b"fake").unwrap();
    fs::write(source2_path.join("photo2.png"), b"fake").unwrap();
    fs::write(source2_path.join("photo3.png"), b"fake").unwrap();

    let mut conn = open_database(&db_path).unwrap();
    initialize_schema(&conn).unwrap();
    migrate_schema(&conn).unwrap();

    let source1 = upsert_source(&conn, &source1_path).unwrap();
    let photos1 = discover_photos(&source1_path).unwrap();
    replace_source_photos(&mut conn, &source1.id, &source1_path, &photos1).unwrap();

    let source2 = upsert_source(&conn, &source2_path).unwrap();
    let photos2 = discover_photos(&source2_path).unwrap();
    replace_source_photos(&mut conn, &source2.id, &source2_path, &photos2).unwrap();

    let summary = get_library_summary(&conn).unwrap();

    assert_eq!(summary.sources.len(), 2);
    assert_eq!(summary.total_photos, 3);

    let s1 = summary
        .sources
        .iter()
        .find(|s| s.name == "source1")
        .unwrap();
    let s2 = summary
        .sources
        .iter()
        .find(|s| s.name == "source2")
        .unwrap();
    assert_eq!(s1.photo_count, 1);
    assert_eq!(s2.photo_count, 2);
}

#[test]
fn test_returns_nested_source_folders_with_aggregate_counts() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let source_path = temp_dir.path().join("photos");
    fs::create_dir_all(source_path.join("Trips/Japan/Kyoto")).unwrap();
    fs::create_dir_all(source_path.join("Family")).unwrap();
    fs::write(source_path.join("root.jpg"), b"fake").unwrap();
    fs::write(source_path.join("Trips/Japan/photo1.jpg"), b"fake").unwrap();
    fs::write(source_path.join("Trips/Japan/Kyoto/photo2.jpg"), b"fake").unwrap();
    fs::write(source_path.join("Family/photo3.png"), b"fake").unwrap();

    let mut conn = open_database(&db_path).unwrap();
    initialize_schema(&conn).unwrap();
    migrate_schema(&conn).unwrap();

    let source = upsert_source(&conn, &source_path).unwrap();
    let photos = discover_photos(&source_path).unwrap();
    replace_source_photos(&mut conn, &source.id, &source_path, &photos).unwrap();

    let folders = get_source_folders(&conn).unwrap();

    let root = folders
        .iter()
        .find(|folder| folder.source_id == source.id && folder.folder_path.is_empty())
        .unwrap();
    let trips = folders
        .iter()
        .find(|folder| folder.folder_path == "Trips")
        .unwrap();
    let japan = folders
        .iter()
        .find(|folder| folder.folder_path == "Trips/Japan")
        .unwrap();
    let kyoto = folders
        .iter()
        .find(|folder| folder.folder_path == "Trips/Japan/Kyoto")
        .unwrap();
    let family = folders
        .iter()
        .find(|folder| folder.folder_path == "Family")
        .unwrap();

    assert_eq!(root.name, "photos");
    assert_eq!(root.depth, 0);
    assert_eq!(root.photo_count, 4);
    assert_eq!(trips.depth, 1);
    assert_eq!(trips.photo_count, 2);
    assert_eq!(japan.depth, 2);
    assert_eq!(japan.photo_count, 2);
    assert_eq!(kyoto.depth, 3);
    assert_eq!(kyoto.photo_count, 1);
    assert_eq!(family.photo_count, 1);
}

#[test]
fn test_filters_timeline_photos_by_source_folder_with_descendants() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let source_path = temp_dir.path().join("photos");
    fs::create_dir_all(source_path.join("Trips/Japan/Kyoto")).unwrap();
    fs::create_dir_all(source_path.join("Trips/France")).unwrap();
    fs::write(source_path.join("Trips/Japan/photo1.jpg"), b"fake").unwrap();
    fs::write(source_path.join("Trips/Japan/Kyoto/photo2.jpg"), b"fake").unwrap();
    fs::write(source_path.join("Trips/France/photo3.jpg"), b"fake").unwrap();

    let mut conn = open_database(&db_path).unwrap();
    initialize_schema(&conn).unwrap();
    migrate_schema(&conn).unwrap();

    let source = upsert_source(&conn, &source_path).unwrap();
    let photos = discover_photos(&source_path).unwrap();
    replace_source_photos(&mut conn, &source.id, &source_path, &photos).unwrap();

    let mut statement = conn
        .prepare("SELECT id FROM photos WHERE source_id = ?1")
        .unwrap();
    let photo_ids: Vec<String> = statement
        .query_map([&source.id], |row| row.get(0))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();

    for photo_id in photo_ids {
        upsert_photo_assets(
            &conn,
            &photo_id,
            "/tmp/thumb.jpg",
            "/tmp/thumb.jpg",
            "/tmp/thumb.jpg",
        )
        .unwrap();
    }

    let photos = get_timeline_photos(&conn, 20, 0, Some(&source.id), Some("Trips/Japan")).unwrap();

    assert_eq!(photos.len(), 2);
    assert!(photos
        .iter()
        .all(|photo| photo.relative_path.starts_with("Trips/Japan/")));
    assert!(photos
        .iter()
        .any(|photo| photo.folder_path == "Trips/Japan/Kyoto"));
}

#[test]
fn test_timeline_photos_include_persisted_dimensions() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let source_path = temp_dir.path().join("photos");
    fs::create_dir(&source_path).unwrap();
    fs::write(source_path.join("photo1.jpg"), b"fake").unwrap();

    let mut conn = open_database(&db_path).unwrap();
    initialize_schema(&conn).unwrap();
    migrate_schema(&conn).unwrap();

    let source = upsert_source(&conn, &source_path).unwrap();
    let photos = discover_photos(&source_path).unwrap();
    replace_source_photos(&mut conn, &source.id, &source_path, &photos).unwrap();

    let photo_id: String = conn
        .query_row("SELECT id FROM photos LIMIT 1", [], |row| row.get(0))
        .unwrap();

    update_photo_dimensions(&conn, &photo_id, 4032, 3024).unwrap();
    upsert_photo_assets(
        &conn,
        &photo_id,
        "/tmp/small.jpg",
        "/tmp/medium.jpg",
        "/tmp/large.jpg",
    )
    .unwrap();

    let photos = get_timeline_photos(&conn, 20, 0, None, None).unwrap();

    assert_eq!(photos.len(), 1);
    assert_eq!(photos[0].width, Some(4032));
    assert_eq!(photos[0].height, Some(3024));
}

#[test]
fn test_timeline_photos_include_persisted_quality_score() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let source_path = temp_dir.path().join("photos");
    fs::create_dir(&source_path).unwrap();
    fs::write(source_path.join("photo1.jpg"), b"fake").unwrap();

    let mut conn = open_database(&db_path).unwrap();
    initialize_schema(&conn).unwrap();
    migrate_schema(&conn).unwrap();

    let source = upsert_source(&conn, &source_path).unwrap();
    let photos = discover_photos(&source_path).unwrap();
    replace_source_photos(&mut conn, &source.id, &source_path, &photos).unwrap();

    let photo_id: String = conn
        .query_row("SELECT id FROM photos LIMIT 1", [], |row| row.get(0))
        .unwrap();
    upsert_photo_assets(
        &conn,
        &photo_id,
        "/tmp/small.jpg",
        "/tmp/medium.jpg",
        "/tmp/large.jpg",
    )
    .unwrap();
    conn.execute(
        "INSERT INTO analysis_results \
         (photo_id, capability, provider_id, schema_version, result_json, confidence, job_id, generated_at) \
         VALUES (?1, 'photo.quality', 'metadata.photo-quality.v1', 1, ?2, 0.85, NULL, 'now')",
        params![
            photo_id,
            serde_json::json!({
                "score": 82,
                "label": "strong",
                "reasons": ["high resolution", "photo format"]
            })
            .to_string()
        ],
    )
    .unwrap();

    let photos = get_timeline_photos(&conn, 20, 0, None, None).unwrap();

    assert_eq!(photos.len(), 1);
    let quality = photos[0].quality.as_ref().expect("quality score");
    assert_eq!(quality.photo_id, photos[0].id);
    assert_eq!(quality.score, 82);
    assert_eq!(quality.label, "strong");
    assert_eq!(quality.reasons, vec!["high resolution", "photo format"]);
}

#[test]
fn test_timeline_photos_include_persisted_exif_metadata() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let source_path = temp_dir.path().join("photos");
    fs::create_dir(&source_path).unwrap();
    fs::write(source_path.join("photo1.jpg"), b"fake").unwrap();

    let mut conn = open_database(&db_path).unwrap();
    initialize_schema(&conn).unwrap();
    migrate_schema(&conn).unwrap();

    let source = upsert_source(&conn, &source_path).unwrap();
    let photos = discover_photos(&source_path).unwrap();
    replace_source_photos(&mut conn, &source.id, &source_path, &photos).unwrap();

    let photo_id: String = conn
        .query_row("SELECT id FROM photos LIMIT 1", [], |row| row.get(0))
        .unwrap();

    update_photo_exif_metadata(
        &conn,
        &photo_id,
        Some("2026-05-07T10:30:00+00:00"),
        Some("Fujifilm"),
        Some("X-T5"),
        Some("XF 23mm F1.4 R LM WR"),
        Some(35.0116),
        Some(135.7681),
    )
    .unwrap();
    upsert_photo_assets(
        &conn,
        &photo_id,
        "/tmp/small.jpg",
        "/tmp/medium.jpg",
        "/tmp/large.jpg",
    )
    .unwrap();

    let photos = get_timeline_photos(&conn, 20, 0, None, None).unwrap();

    assert_eq!(photos.len(), 1);
    assert_eq!(
        photos[0].captured_at,
        Some("2026-05-07T10:30:00+00:00".to_string())
    );
    assert_eq!(photos[0].camera_make, Some("Fujifilm".to_string()));
    assert_eq!(photos[0].camera_model, Some("X-T5".to_string()));
    assert_eq!(
        photos[0].lens_model,
        Some("XF 23mm F1.4 R LM WR".to_string())
    );
    assert_eq!(photos[0].gps_latitude, Some(35.0116));
    assert_eq!(photos[0].gps_longitude, Some(135.7681));
}

#[test]
fn test_timeline_photos_sort_by_captured_at_before_file_mtime() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let source_path = temp_dir.path().join("photos");
    fs::create_dir(&source_path).unwrap();
    fs::write(source_path.join("new-file-old-capture.jpg"), b"fake").unwrap();
    fs::write(source_path.join("old-file-new-capture.jpg"), b"fake").unwrap();

    let mut conn = open_database(&db_path).unwrap();
    initialize_schema(&conn).unwrap();
    migrate_schema(&conn).unwrap();

    let source = upsert_source(&conn, &source_path).unwrap();
    let photos = discover_photos(&source_path).unwrap();
    replace_source_photos(&mut conn, &source.id, &source_path, &photos).unwrap();

    let photo_ids: Vec<(String, String)> = conn
        .prepare("SELECT id, file_name FROM photos")
        .unwrap()
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();

    for (photo_id, file_name) in photo_ids {
        let captured_at = if file_name == "old-file-new-capture.jpg" {
            "2026-05-07T10:30:00+00:00"
        } else {
            "2024-01-01T10:30:00+00:00"
        };
        update_photo_exif_metadata(
            &conn,
            &photo_id,
            Some(captured_at),
            None,
            None,
            None,
            None,
            None,
        )
        .unwrap();
        upsert_photo_assets(
            &conn,
            &photo_id,
            "/tmp/small.jpg",
            "/tmp/medium.jpg",
            "/tmp/large.jpg",
        )
        .unwrap();
    }

    conn.execute(
        "UPDATE photos SET file_mtime = 1893456000 WHERE file_name = 'new-file-old-capture.jpg'",
        [],
    )
    .unwrap();
    conn.execute(
        "UPDATE photos SET file_mtime = 1704067200 WHERE file_name = 'old-file-new-capture.jpg'",
        [],
    )
    .unwrap();

    let photos = get_timeline_photos(&conn, 20, 0, None, None).unwrap();

    assert_eq!(photos[0].file_name, "old-file-new-capture.jpg");
    assert_eq!(photos[1].file_name, "new-file-old-capture.jpg");
}

#[test]
fn test_search_photos_matches_name_path_source_and_date() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let source_path = temp_dir.path().join("Japan Library");
    fs::create_dir_all(source_path.join("Trips/Kyoto")).unwrap();
    fs::create_dir_all(source_path.join("Family")).unwrap();
    fs::write(source_path.join("Trips/Kyoto/temple.jpg"), b"fake").unwrap();
    fs::write(source_path.join("Family/birthday.png"), b"fake").unwrap();

    let mut conn = open_database(&db_path).unwrap();
    initialize_schema(&conn).unwrap();
    migrate_schema(&conn).unwrap();

    let source = upsert_source(&conn, &source_path).unwrap();
    let photos = discover_photos(&source_path).unwrap();
    replace_source_photos(&mut conn, &source.id, &source_path, &photos).unwrap();

    let mut statement = conn
        .prepare("SELECT id FROM photos WHERE source_id = ?1")
        .unwrap();
    let photo_ids: Vec<String> = statement
        .query_map([&source.id], |row| row.get(0))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();

    for photo_id in photo_ids {
        upsert_photo_assets(
            &conn,
            &photo_id,
            "/tmp/small.jpg",
            "/tmp/medium.jpg",
            "/tmp/large.jpg",
        )
        .unwrap();
    }

    conn.execute(
        "UPDATE photos SET file_mtime = 1704067200 WHERE file_name = 'temple.jpg'",
        [],
    )
    .unwrap();

    assert_eq!(search_photos(&conn, 20, 0, "temple").unwrap().len(), 1);
    assert_eq!(search_photos(&conn, 20, 0, "Trips/Kyoto").unwrap().len(), 1);
    assert_eq!(
        search_photos(&conn, 20, 0, "Japan Library").unwrap().len(),
        2
    );

    let date_matches = search_photos(&conn, 20, 0, "2024-01-01").unwrap();
    assert_eq!(date_matches.len(), 1);
    assert_eq!(date_matches[0].file_name, "temple.jpg");

    assert!(search_photos(&conn, 20, 0, "missing").unwrap().is_empty());
}
