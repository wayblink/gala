use gala_lib::library::scanner::discover_photos;
use gala_lib::library::storage::{
    get_library_summary, initialize_schema, open_database, replace_source_photos, upsert_source,
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

    let source = upsert_source(&conn, &source_path).unwrap();
    let photos = discover_photos(&source_path).unwrap();

    replace_source_photos(&mut conn, &source.id, &source_path, &photos).unwrap();

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM photos WHERE source_id = ?1", [&source.id], |row| row.get(0))
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

    let source1 = upsert_source(&conn, &source1_path).unwrap();
    let photos1 = discover_photos(&source1_path).unwrap();
    replace_source_photos(&mut conn, &source1.id, &source1_path, &photos1).unwrap();

    let source2 = upsert_source(&conn, &source2_path).unwrap();
    let photos2 = discover_photos(&source2_path).unwrap();
    replace_source_photos(&mut conn, &source2.id, &source2_path, &photos2).unwrap();

    let summary = get_library_summary(&conn).unwrap();

    assert_eq!(summary.sources.len(), 2);
    assert_eq!(summary.total_photos, 3);

    let s1 = summary.sources.iter().find(|s| s.name == "source1").unwrap();
    let s2 = summary.sources.iter().find(|s| s.name == "source2").unwrap();
    assert_eq!(s1.photo_count, 1);
    assert_eq!(s2.photo_count, 2);
}
