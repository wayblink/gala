use gala_lib::library::scanner::discover_photos;
use gala_lib::library::storage::{
    get_library_summary, get_source_folders, get_timeline_photos, initialize_schema,
    migrate_schema, open_database, replace_source_photos, search_photos, update_photo_dimensions,
    upsert_photo_assets, upsert_source,
};
use std::fs;
use tempfile::TempDir;

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
}

#[test]
fn test_migrates_legacy_v2_schema_missing_metadata_columns() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");

    let conn = open_database(&db_path).unwrap();
    conn.execute_batch(
        r#"
        CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
        INSERT INTO schema_version (version) VALUES (2);

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

    assert!(photo_columns.contains(&"favorited_at".to_string()));
    assert!(photo_columns.contains(&"width".to_string()));
    assert!(photo_columns.contains(&"height".to_string()));
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
