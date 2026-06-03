use crate::library::exif::extract_exif_metadata;
use crate::library::models::{
    Album, FilterOptions, Label, LibrarySummary, ScanProgress, ScanSummary, SourceFolder, Tag,
    TimelinePhoto,
};
use crate::library::scanner::discover_photos_with_progress;
use crate::library::storage::{
    add_photo_to_album, add_photos_to_album_batch, add_tags_to_photos_batch, create_album,
    delete_album, delete_source, get_album_photos, get_albums, get_all_tags, get_favorite_photos,
    get_filter_options, get_filtered_photos, get_hidden_photos, get_library_summary as get_summary,
    get_labels, materialize_content_classification_results, get_photo_original_path, get_photo_tags, get_photos_by_label, get_photos_by_tag, get_recently_added_photos,
    get_source_folders, get_timeline_photos, initialize_schema, mark_photo_assets_failed,
    migrate_schema, open_database, remove_photo_from_album, remove_photos_from_album_batch,
    rename_album, search_photos, set_photo_favorite, set_photo_hidden, set_photo_tags, sync_all_person_labels,
    set_photos_favorite_batch, set_photos_hidden_batch, update_photo_dimensions,
    update_photo_exif_metadata, upsert_photo_assets, upsert_source, upsert_source_photos,
};
use crate::library::thumbnails::ThumbnailGenerator;
use base64::{engine::general_purpose, Engine as _};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

const MAX_VIEWER_ORIGINAL_BYTES: u64 = 50 * 1024 * 1024;
const SCAN_PROGRESS_EVENT: &str = "gala://scan-progress";

pub(crate) fn get_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    Ok(app_data_dir.join("index.sqlite"))
}

fn get_thumbnail_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    Ok(app_data_dir.join("thumbnails"))
}

#[tauri::command]
pub async fn pick_photo_folder(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let folder = app.dialog().file().blocking_pick_folder();

    match folder {
        Some(path) => {
            let path_buf = path
                .as_path()
                .ok_or_else(|| "Failed to convert path".to_string())?;
            Ok(Some(
                path_buf
                    .to_str()
                    .ok_or_else(|| "Invalid folder path".to_string())?
                    .to_string(),
            ))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub fn scan_photo_source(app: AppHandle, root_path: String) -> Result<ScanSummary, String> {
    let result = scan_photo_source_inner(&app, root_path.clone());

    if let Err(error) = &result {
        emit_scan_progress(
            &app,
            ScanProgress {
                status: "failed".to_string(),
                root_path: Some(root_path),
                source_id: None,
                discovered_count: 0,
                indexed_count: 0,
                thumbnail_ready_count: 0,
                thumbnail_failed_count: 0,
                skipped_count: 0,
                current_file: None,
                error_message: Some(error.clone()),
            },
        );
    }

    result
}

fn scan_photo_source_inner(app: &AppHandle, root_path: String) -> Result<ScanSummary, String> {
    eprintln!("[scan_photo_source] Starting scan for: {}", root_path);

    emit_scan_progress(
        app,
        ScanProgress {
            status: "scanning".to_string(),
            root_path: Some(root_path.clone()),
            source_id: None,
            discovered_count: 0,
            indexed_count: 0,
            thumbnail_ready_count: 0,
            thumbnail_failed_count: 0,
            skipped_count: 0,
            current_file: None,
            error_message: None,
        },
    );

    let db_path = get_db_path(app)?;
    eprintln!("[scan_photo_source] Database path: {:?}", db_path);

    let mut conn = open_database(&db_path)?;
    initialize_schema(&conn)?;

    let source_path = PathBuf::from(&root_path);
    let source = upsert_source(&conn, &source_path)?;
    eprintln!("[scan_photo_source] Source ID: {}", source.id);

    let photos = discover_photos_with_progress(&source_path, |count, file_name| {
        emit_scan_progress(
            app,
            ScanProgress {
                status: "scanning".to_string(),
                root_path: Some(root_path.clone()),
                source_id: Some(source.id.clone()),
                discovered_count: count as i64,
                indexed_count: 0,
                thumbnail_ready_count: 0,
                thumbnail_failed_count: 0,
                skipped_count: 0,
                current_file: Some(file_name.to_string()),
                error_message: None,
            },
        );
    })?;
    let indexed_count = photos.len() as i64;
    eprintln!("[scan_photo_source] Discovered {} photos", indexed_count);

    emit_scan_progress(
        app,
        ScanProgress {
            status: "indexing".to_string(),
            root_path: Some(root_path.clone()),
            source_id: Some(source.id.clone()),
            discovered_count: indexed_count,
            indexed_count: 0,
            thumbnail_ready_count: 0,
            thumbnail_failed_count: 0,
            skipped_count: 0,
            current_file: None,
            error_message: None,
        },
    );

    // Incremental upsert — only reprocesses changed/new files, preserves user data
    let upserted = upsert_source_photos(&mut conn, &source.id, &source_path, &photos)?;
    let total_upserted = upserted.len() as i64;
    let needs_work: Vec<_> = upserted.iter().filter(|p| p.needs_thumbnail).collect();
    let skipped_count = total_upserted - needs_work.len() as i64;

    emit_scan_progress(
        app,
        ScanProgress {
            status: "thumbnailing".to_string(),
            root_path: Some(root_path.clone()),
            source_id: Some(source.id.clone()),
            discovered_count: indexed_count,
            indexed_count,
            thumbnail_ready_count: 0,
            thumbnail_failed_count: 0,
            skipped_count,
            current_file: None,
            error_message: None,
        },
    );

    let thumbnail_cache = get_thumbnail_cache_dir(app)?;
    eprintln!("[scan_photo_source] Thumbnail cache: {:?}", thumbnail_cache);
    let thumbnail_gen = ThumbnailGenerator::new(thumbnail_cache)?;

    let mut thumbnail_ready_count = 0_i64;
    let mut thumbnail_failed_count = 0_i64;

    for upserted_photo in needs_work {
        let photo_id = &upserted_photo.id;
        let photo_path = &upserted_photo.absolute_path;
        eprintln!(
            "[scan_photo_source] Generating thumbnails for: {}",
            photo_path
        );
        let current_file = PathBuf::from(photo_path)
            .file_name()
            .and_then(|f| f.to_str())
            .map(|f| f.to_string());

        match thumbnail_gen.generate_all(photo_id, &PathBuf::from(photo_path)) {
            Ok(paths) => {
                thumbnail_ready_count += 1;
                eprintln!(
                    "[scan_photo_source] Generated thumbnails: small={}, medium={}, large={}",
                    paths.small, paths.medium, paths.large
                );
                if let Err(e) =
                    upsert_photo_assets(&conn, photo_id, &paths.small, &paths.medium, &paths.large)
                {
                    eprintln!("Failed to save thumbnail paths for {}: {}", photo_id, e);
                }
                if let Err(e) = update_photo_dimensions(
                    &conn,
                    photo_id,
                    paths.original_width,
                    paths.original_height,
                ) {
                    eprintln!("Failed to save dimensions for {}: {}", photo_id, e);
                }
            }
            Err(e) => {
                thumbnail_failed_count += 1;
                eprintln!("Failed to generate thumbnails for {}: {}", photo_id, e);
                if let Err(e) = mark_photo_assets_failed(&conn, photo_id) {
                    eprintln!("Failed to mark assets as failed for {}: {}", photo_id, e);
                }
            }
        }

        match extract_exif_metadata(&PathBuf::from(photo_path)) {
            Ok(metadata) => {
                if let Err(e) = update_photo_exif_metadata(
                    &conn,
                    photo_id,
                    metadata.captured_at.as_deref(),
                    metadata.camera_make.as_deref(),
                    metadata.camera_model.as_deref(),
                    metadata.lens_model.as_deref(),
                    metadata.gps_latitude,
                    metadata.gps_longitude,
                ) {
                    eprintln!("Failed to save EXIF metadata for {}: {}", photo_id, e);
                }
            }
            Err(e) => eprintln!("Skipping EXIF for {}: {}", photo_id, e),
        }

        emit_scan_progress(
            app,
            ScanProgress {
                status: "thumbnailing".to_string(),
                root_path: Some(root_path.clone()),
                source_id: Some(source.id.clone()),
                discovered_count: indexed_count,
                indexed_count,
                thumbnail_ready_count,
                thumbnail_failed_count,
                skipped_count,
                current_file,
                error_message: None,
            },
        );
    }

    let updated_source = upsert_source(&conn, &source_path)?;
    eprintln!("[scan_photo_source] Scan complete!");

    emit_scan_progress(
        app,
        ScanProgress {
            status: "completed".to_string(),
            root_path: Some(root_path),
            source_id: Some(source.id),
            discovered_count: indexed_count,
            indexed_count,
            thumbnail_ready_count,
            thumbnail_failed_count,
            skipped_count,
            current_file: None,
            error_message: None,
        },
    );

    Ok(ScanSummary {
        source: updated_source,
        indexed_count,
        skipped_count,
    })
}

fn emit_scan_progress(app: &AppHandle, progress: ScanProgress) {
    if let Err(error) = app.emit(SCAN_PROGRESS_EVENT, progress) {
        eprintln!(
            "[scan_photo_source] Failed to emit scan progress: {}",
            error
        );
    }
}

#[tauri::command]
pub fn get_library_summary(app: AppHandle) -> Result<LibrarySummary, String> {
    let db_path = get_db_path(&app)?;

    if !db_path.exists() {
        return Ok(LibrarySummary {
            sources: vec![],
            total_photos: 0,
            recently_added_count: 0,
            favorites_count: 0,
            hidden_count: 0,
        });
    }

    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    get_summary(&conn)
}

#[tauri::command]
pub fn get_timeline_photos_cmd(
    app: AppHandle,
    limit: i64,
    offset: i64,
    source_id: Option<String>,
    folder_path: Option<String>,
) -> Result<Vec<TimelinePhoto>, String> {
    let db_path = get_db_path(&app)?;

    if !db_path.exists() {
        return Ok(vec![]);
    }

    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    get_timeline_photos(
        &conn,
        limit,
        offset,
        source_id.as_deref(),
        folder_path.as_deref(),
    )
}

#[tauri::command]
pub fn get_source_folders_cmd(app: AppHandle) -> Result<Vec<SourceFolder>, String> {
    let db_path = get_db_path(&app)?;

    if !db_path.exists() {
        return Ok(vec![]);
    }

    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    get_source_folders(&conn)
}

#[tauri::command]
pub fn get_thumbnail_file(
    app: AppHandle,
    photo_id: String,
    size: String,
) -> Result<String, String> {
    let thumbnail_cache = get_thumbnail_cache_dir(&app)?;

    let size_dir = match size.as_str() {
        "small" => "small",
        "medium" => "medium",
        "large" => "large",
        _ => return Err("Invalid thumbnail size".to_string()),
    };

    let thumbnail_path = thumbnail_cache
        .join(size_dir)
        .join(format!("{}.jpg", photo_id));

    if !thumbnail_path.exists() {
        return Err(format!("Thumbnail not found: {}", photo_id));
    }

    thumbnail_path
        .to_str()
        .ok_or_else(|| "Invalid thumbnail path".to_string())
        .map(|s| s.to_string())
}

#[tauri::command]
pub fn get_photo_data_url(app: AppHandle, photo_id: String) -> Result<String, String> {
    let db_path = get_db_path(&app)?;

    if !db_path.exists() {
        return Err("Photo library is not initialized".to_string());
    }

    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;

    let photo_path = PathBuf::from(get_photo_original_path(&conn, &photo_id)?);
    let metadata = std::fs::metadata(&photo_path)
        .map_err(|e| format!("Failed to read photo metadata: {}", e))?;

    if metadata.len() > MAX_VIEWER_ORIGINAL_BYTES {
        return Err(format!(
            "Original photo is too large for inline preview: {} bytes",
            metadata.len()
        ));
    }

    let bytes =
        std::fs::read(&photo_path).map_err(|e| format!("Failed to read photo file: {}", e))?;
    let mime_type = mime_type_for_path(&photo_path);
    let encoded = general_purpose::STANDARD.encode(bytes);

    Ok(format!("data:{};base64,{}", mime_type, encoded))
}

fn mime_type_for_path(path: &PathBuf) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "tif" | "tiff" => "image/tiff",
        "heic" => "image/heic",
        _ => "application/octet-stream",
    }
}

#[tauri::command]
pub fn get_recently_added_photos_cmd(
    app: AppHandle,
    limit: i64,
    offset: i64,
) -> Result<Vec<TimelinePhoto>, String> {
    let db_path = get_db_path(&app)?;

    if !db_path.exists() {
        return Ok(vec![]);
    }

    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    get_recently_added_photos(&conn, limit, offset)
}

#[tauri::command]
pub fn get_favorite_photos_cmd(
    app: AppHandle,
    limit: i64,
    offset: i64,
) -> Result<Vec<TimelinePhoto>, String> {
    let db_path = get_db_path(&app)?;

    if !db_path.exists() {
        return Ok(vec![]);
    }

    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    get_favorite_photos(&conn, limit, offset)
}

#[tauri::command]
pub fn search_photos_cmd(
    app: AppHandle,
    query: String,
    limit: i64,
    offset: i64,
) -> Result<Vec<TimelinePhoto>, String> {
    let db_path = get_db_path(&app)?;

    if !db_path.exists() {
        return Ok(vec![]);
    }

    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    search_photos(&conn, limit, offset, &query)
}

#[tauri::command]
pub fn toggle_photo_favorite_cmd(app: AppHandle, photo_id: String) -> Result<bool, String> {
    let db_path = get_db_path(&app)?;

    if !db_path.exists() {
        return Err("Photo library is not initialized".to_string());
    }

    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;

    let current: Option<String> = conn
        .query_row(
            "SELECT favorited_at FROM photos WHERE id = ?1",
            params![photo_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to query photo: {}", e))?;

    let new_state = current.is_none();
    set_photo_favorite(&conn, &photo_id, new_state)?;
    Ok(new_state)
}

fn open_conn(app: &AppHandle) -> Result<rusqlite::Connection, String> {
    let db_path = get_db_path(app)?;
    if !db_path.exists() {
        return Err("Photo library not initialized".to_string());
    }
    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    Ok(conn)
}

#[tauri::command]
pub fn toggle_photo_hidden_cmd(app: AppHandle, photo_id: String) -> Result<bool, String> {
    let conn = open_conn(&app)?;
    let current: Option<String> = conn
        .query_row(
            "SELECT hidden_at FROM photos WHERE id = ?1",
            params![photo_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to query photo: {}", e))?;
    let new_state = current.is_none();
    set_photo_hidden(&conn, &photo_id, new_state)?;
    Ok(new_state)
}

#[tauri::command]
pub fn get_hidden_photos_cmd(
    app: AppHandle,
    limit: i64,
    offset: i64,
) -> Result<Vec<TimelinePhoto>, String> {
    let db_path = get_db_path(&app)?;
    if !db_path.exists() {
        return Ok(vec![]);
    }
    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    get_hidden_photos(&conn, limit, offset)
}

#[tauri::command]
pub fn get_filter_options_cmd(app: AppHandle) -> Result<FilterOptions, String> {
    let conn = open_conn(&app)?;
    get_filter_options(&conn)
}

#[tauri::command]
pub fn get_filtered_photos_cmd(
    app: AppHandle,
    limit: i64,
    offset: i64,
    source_id: Option<String>,
    folder_path: Option<String>,
    cameras: Vec<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    extensions: Vec<String>,
) -> Result<Vec<TimelinePhoto>, String> {
    let db_path = get_db_path(&app)?;
    if !db_path.exists() {
        return Ok(vec![]);
    }
    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    get_filtered_photos(
        &conn,
        limit,
        offset,
        source_id.as_deref(),
        folder_path.as_deref(),
        &cameras,
        date_from.as_deref(),
        date_to.as_deref(),
        &extensions,
    )
}

#[tauri::command]
pub fn get_albums_cmd(app: AppHandle) -> Result<Vec<Album>, String> {
    let db_path = get_db_path(&app)?;
    if !db_path.exists() {
        return Ok(vec![]);
    }
    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    get_albums(&conn)
}

#[tauri::command]
pub fn create_album_cmd(app: AppHandle, name: String) -> Result<Album, String> {
    let conn = open_conn(&app)?;
    create_album(&conn, &name)
}

#[tauri::command]
pub fn delete_album_cmd(app: AppHandle, album_id: String) -> Result<(), String> {
    let conn = open_conn(&app)?;
    delete_album(&conn, &album_id)
}

#[tauri::command]
pub fn rename_album_cmd(app: AppHandle, album_id: String, new_name: String) -> Result<(), String> {
    let conn = open_conn(&app)?;
    rename_album(&conn, &album_id, &new_name)
}

#[tauri::command]
pub fn add_photo_to_album_cmd(
    app: AppHandle,
    album_id: String,
    photo_id: String,
) -> Result<(), String> {
    let conn = open_conn(&app)?;
    add_photo_to_album(&conn, &album_id, &photo_id)
}

#[tauri::command]
pub fn remove_photo_from_album_cmd(
    app: AppHandle,
    album_id: String,
    photo_id: String,
) -> Result<(), String> {
    let conn = open_conn(&app)?;
    remove_photo_from_album(&conn, &album_id, &photo_id)
}

#[tauri::command]
pub fn get_album_photos_cmd(
    app: AppHandle,
    album_id: String,
    limit: i64,
    offset: i64,
) -> Result<Vec<TimelinePhoto>, String> {
    let db_path = get_db_path(&app)?;
    if !db_path.exists() {
        return Ok(vec![]);
    }
    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    get_album_photos(&conn, &album_id, limit, offset)
}

#[tauri::command]
pub fn get_photos_by_person_cmd(
    app: AppHandle,
    person_id: String,
    limit: i64,
    offset: i64,
) -> Result<Vec<TimelinePhoto>, String> {
    let db_path = get_db_path(&app)?;
    if !db_path.exists() {
        return Ok(vec![]);
    }
    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    crate::library::storage::get_photos_by_person(&conn, &person_id, limit, offset)
}

#[tauri::command]
pub fn add_photos_to_album_batch_cmd(
    app: AppHandle,
    album_id: String,
    photo_ids: Vec<String>,
) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let mut conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    add_photos_to_album_batch(&mut conn, &album_id, &photo_ids)
}

#[tauri::command]
pub fn remove_photos_from_album_batch_cmd(
    app: AppHandle,
    album_id: String,
    photo_ids: Vec<String>,
) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let mut conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    remove_photos_from_album_batch(&mut conn, &album_id, &photo_ids)
}

#[tauri::command]
pub fn set_photos_favorite_batch_cmd(
    app: AppHandle,
    photo_ids: Vec<String>,
    favorited: bool,
) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let mut conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    set_photos_favorite_batch(&mut conn, &photo_ids, favorited)
}

#[tauri::command]
pub fn set_photos_hidden_batch_cmd(
    app: AppHandle,
    photo_ids: Vec<String>,
    hidden: bool,
) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let mut conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    set_photos_hidden_batch(&mut conn, &photo_ids, hidden)
}

#[tauri::command]
pub fn add_tags_to_photos_batch_cmd(
    app: AppHandle,
    photo_ids: Vec<String>,
    tags: Vec<String>,
) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let mut conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    add_tags_to_photos_batch(&mut conn, &photo_ids, &tags)
}

/// Remove a source: gather its photo IDs, drop on-disk thumbnails for those
/// photos, then run the cascading DB delete inside a transaction.
#[tauri::command]
pub fn delete_source_cmd(app: AppHandle, source_id: String) -> Result<(), String> {
    let db_path = get_db_path(&app)?;
    let mut conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;

    let photo_ids: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT id FROM photos WHERE source_id = ?1")
            .map_err(|e| format!("Failed to prepare photo lookup: {}", e))?;
        let rows = stmt
            .query_map(params![source_id], |row| row.get::<_, String>(0))
            .map_err(|e| format!("Failed to query source photos: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect source photo ids: {}", e))?;
        rows
    };

    let cache_root = get_thumbnail_cache_dir(&app)?;
    for size in ["small", "medium", "large"] {
        let size_dir = cache_root.join(size);
        for photo_id in &photo_ids {
            let path = size_dir.join(format!("{}.jpg", photo_id));
            if path.exists() {
                let _ = std::fs::remove_file(&path);
            }
        }
    }

    delete_source(&mut conn, &source_id)
}

#[tauri::command]
pub fn get_photo_tags_cmd(app: AppHandle, photo_id: String) -> Result<Vec<String>, String> {
    let conn = open_conn(&app)?;
    get_photo_tags(&conn, &photo_id)
}

#[tauri::command]
pub fn set_photo_tags_cmd(
    app: AppHandle,
    photo_id: String,
    tags: Vec<String>,
) -> Result<Vec<String>, String> {
    let conn = open_conn(&app)?;
    set_photo_tags(&conn, &photo_id, &tags)
}

#[tauri::command]
pub fn get_all_tags_cmd(app: AppHandle) -> Result<Vec<Tag>, String> {
    let db_path = get_db_path(&app)?;
    if !db_path.exists() {
        return Ok(vec![]);
    }
    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    get_all_tags(&conn)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentLabelMaterializeSummary {
    pub photos_processed: i64,
    pub labels_written: i64,
}

#[tauri::command]
pub fn materialize_content_labels_cmd(
    app: AppHandle,
    min_confidence: Option<f64>,
    source_id: Option<String>,
) -> Result<ContentLabelMaterializeSummary, String> {
    let db_path = get_db_path(&app)?;
    if !db_path.exists() {
        return Ok(ContentLabelMaterializeSummary { photos_processed: 0, labels_written: 0 });
    }
    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    let (photos_processed, labels_written) =
        materialize_content_classification_results(&conn, min_confidence.unwrap_or(0.35), source_id.as_deref())?;
    Ok(ContentLabelMaterializeSummary { photos_processed, labels_written })
}

#[tauri::command]
pub fn get_labels_cmd(app: AppHandle, kind: Option<String>) -> Result<Vec<Label>, String> {
    let db_path = get_db_path(&app)?;
    if !db_path.exists() {
        return Ok(vec![]);
    }
    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    get_labels(&conn, kind.as_deref())
}

#[tauri::command]
pub fn get_photos_by_label_cmd(
    app: AppHandle,
    label_id: String,
    limit: i64,
    offset: i64,
) -> Result<Vec<TimelinePhoto>, String> {
    let db_path = get_db_path(&app)?;
    if !db_path.exists() {
        return Ok(vec![]);
    }
    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    get_photos_by_label(&conn, &label_id, limit, offset)
}

#[tauri::command]
pub fn sync_person_labels_cmd(app: AppHandle) -> Result<i64, String> {
    let conn = open_conn(&app)?;
    sync_all_person_labels(&conn)
}

#[tauri::command]
pub fn get_photos_by_tag_cmd(
    app: AppHandle,
    tag_name: String,
    limit: i64,
    offset: i64,
) -> Result<Vec<TimelinePhoto>, String> {
    let db_path = get_db_path(&app)?;
    if !db_path.exists() {
        return Ok(vec![]);
    }
    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    get_photos_by_tag(&conn, &tag_name, limit, offset)
}

#[tauri::command]
pub fn reveal_in_finder_cmd(app: AppHandle, photo_id: String) -> Result<(), String> {
    let conn = open_conn(&app)?;
    let path = get_photo_original_path(&conn, &photo_id)?;
    std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to reveal in Finder: {}", e))?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorganizePlanOptions {
    pub target_root: String,
    pub pattern: String,
    pub mode: String,
    pub collision_strategy: String,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorganizeTreeNode {
    pub name: String,
    pub path: String,
    pub count: i64,
    pub children: Vec<ReorganizeTreeNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorganizePlanEntry {
    pub photo_id: String,
    pub file_name: String,
    pub source_path: String,
    pub target_path: String,
    pub before_dir: String,
    pub after_dir: String,
    pub action: String,
    pub conflict: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorganizePlanDto {
    pub id: String,
    pub options: ReorganizePlanOptions,
    pub total_photos: i64,
    pub planned_count: i64,
    pub skipped_count: i64,
    pub conflict_count: i64,
    pub before_tree: Vec<ReorganizeTreeNode>,
    pub after_tree: Vec<ReorganizeTreeNode>,
    pub entries: Vec<ReorganizePlanEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorganizeExecuteSummary {
    pub attempted: i64,
    pub completed: i64,
    pub failed: i64,
    pub skipped: i64,
    pub errors: Vec<String>,
}

#[derive(Debug)]
struct ReorgPhotoRow {
    id: String,
    source_name: String,
    root_path: String,
    relative_path: String,
    file_name: String,
    captured_at: Option<String>,
    file_mtime: i64,
    camera_make: Option<String>,
    camera_model: Option<String>,
    extension: String,
}

#[derive(Default)]
struct TreeBuilderNode {
    count: i64,
    children: BTreeMap<String, TreeBuilderNode>,
}

fn sanitize_component(input: &str, fallback: &str) -> String {
    let cleaned = input
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            ch if ch.is_control() => '-',
            ch => ch,
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_matches(['.', ' '])
        .to_string();
    if cleaned.is_empty() {
        fallback.to_string()
    } else {
        cleaned
    }
}

fn photo_date_parts(captured_at: Option<&str>, file_mtime: i64) -> (String, String, String) {
    if let Some(value) = captured_at {
        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(value) {
            return (
                dt.format("%Y").to_string(),
                dt.format("%m").to_string(),
                dt.format("%d").to_string(),
            );
        }
    }
    let dt = chrono::DateTime::from_timestamp(file_mtime, 0).unwrap_or_else(chrono::Utc::now);
    (
        dt.format("%Y").to_string(),
        dt.format("%m").to_string(),
        dt.format("%d").to_string(),
    )
}

fn apply_reorganize_pattern(pattern: &str, row: &ReorgPhotoRow) -> String {
    let (year, month, day) = photo_date_parts(row.captured_at.as_deref(), row.file_mtime);
    let camera = sanitize_component(
        &format!(
            "{} {}",
            row.camera_make.as_deref().unwrap_or(""),
            row.camera_model.as_deref().unwrap_or("")
        ),
        "Unknown Camera",
    );
    let source = sanitize_component(&row.source_name, "Unknown Source");
    let ext = sanitize_component(row.extension.trim_start_matches('.'), "file");
    let mut rendered = pattern
        .replace("{year}", &year)
        .replace("{month}", &month)
        .replace("{day}", &day)
        .replace("{source}", &source)
        .replace("{camera}", &camera)
        .replace("{ext}", &ext);
    rendered = rendered.replace('\\', "/");
    let parts = rendered
        .split('/')
        .map(|part| sanitize_component(part, "Unsorted"))
        .filter(|part| !part.is_empty() && part != ".")
        .collect::<Vec<_>>();
    if parts.is_empty() {
        "Unsorted".to_string()
    } else {
        parts.join("/")
    }
}

fn folder_for_relative_path(relative_path: &str) -> String {
    Path::new(relative_path)
        .parent()
        .and_then(|p| p.to_str())
        .unwrap_or("")
        .replace('\\', "/")
}

fn insert_tree_path(mut root: &mut TreeBuilderNode, path: &str) {
    root.count += 1;
    for part in path.split('/').filter(|p| !p.is_empty()) {
        root = root.children.entry(part.to_string()).or_default();
        root.count += 1;
    }
}

fn flatten_tree(node: TreeBuilderNode, parent_path: &str) -> Vec<ReorganizeTreeNode> {
    node.children
        .into_iter()
        .map(|(name, child)| {
            let path = if parent_path.is_empty() {
                name.clone()
            } else {
                format!("{}/{}", parent_path, name)
            };
            let count = child.count;
            let children = flatten_tree(child, &path);
            ReorganizeTreeNode {
                name,
                path,
                count,
                children,
            }
        })
        .collect()
}

fn resolve_target_collision(
    target: &Path,
    strategy: &str,
    planned_targets: &mut HashSet<PathBuf>,
) -> (PathBuf, String, bool, bool) {
    let exists_or_planned = target.exists() || planned_targets.contains(target);
    if !exists_or_planned {
        planned_targets.insert(target.to_path_buf());
        return (target.to_path_buf(), "plan".to_string(), false, false);
    }

    match strategy {
        "skip" => (target.to_path_buf(), "skip".to_string(), true, true),
        "overwrite" => {
            planned_targets.insert(target.to_path_buf());
            (target.to_path_buf(), "overwrite".to_string(), true, false)
        }
        _ => {
            let stem = target
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("photo");
            let ext = target.extension().and_then(|e| e.to_str()).unwrap_or("");
            let parent = target.parent().unwrap_or_else(|| Path::new(""));
            for idx in 2..10_000 {
                let name = if ext.is_empty() {
                    format!("{} ({})", stem, idx)
                } else {
                    format!("{} ({}).{}", stem, idx, ext)
                };
                let candidate = parent.join(name);
                if !candidate.exists() && !planned_targets.contains(&candidate) {
                    planned_targets.insert(candidate.clone());
                    return (candidate, "rename".to_string(), true, false);
                }
            }
            (target.to_path_buf(), "skip".to_string(), true, true)
        }
    }
}

#[tauri::command]
pub fn reorganize_scan_plan_cmd(
    app: AppHandle,
    options: ReorganizePlanOptions,
) -> Result<ReorganizePlanDto, String> {
    let target_root = PathBuf::from(options.target_root.trim());
    if options.target_root.trim().is_empty() {
        return Err("Target root is required".to_string());
    }
    std::fs::create_dir_all(&target_root)
        .map_err(|e| format!("Failed to create target root: {}", e))?;

    let conn = open_conn(&app)?;
    let limit = options.limit.unwrap_or(100_000).clamp(1, 100_000);
    let mut stmt = conn
        .prepare(
            "SELECT p.id, s.name, s.root_path, p.relative_path, p.file_name, \
                    p.captured_at, p.file_mtime, p.camera_make, p.camera_model, p.extension \
             FROM photos p INNER JOIN sources s ON s.id = p.source_id \
             WHERE p.status = 'indexed' AND p.hidden_at IS NULL \
             ORDER BY COALESCE(strftime('%s', p.captured_at), p.file_mtime) ASC, p.relative_path ASC \
             LIMIT ?1",
        )
        .map_err(|e| format!("Failed to prepare reorganize scan: {}", e))?;
    let rows = stmt
        .query_map(params![limit], |row| {
            Ok(ReorgPhotoRow {
                id: row.get(0)?,
                source_name: row.get(1)?,
                root_path: row.get(2)?,
                relative_path: row.get(3)?,
                file_name: row.get(4)?,
                captured_at: row.get(5)?,
                file_mtime: row.get(6)?,
                camera_make: row.get(7)?,
                camera_model: row.get(8)?,
                extension: row.get(9)?,
            })
        })
        .map_err(|e| format!("Failed to query reorganize scan: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect reorganize rows: {}", e))?;

    let mut before_root = TreeBuilderNode::default();
    let mut after_root = TreeBuilderNode::default();
    let mut planned_targets: HashSet<PathBuf> = HashSet::new();
    let mut entries = Vec::new();
    let mut skipped_count = 0_i64;
    let mut conflict_count = 0_i64;

    for row in rows.iter() {
        let source_path = Path::new(&row.root_path).join(&row.relative_path);
        let before_dir = folder_for_relative_path(&row.relative_path);
        let before_tree_path = if before_dir.is_empty() {
            sanitize_component(&row.source_name, "Source")
        } else {
            format!(
                "{}/{}",
                sanitize_component(&row.source_name, "Source"),
                before_dir
            )
        };
        insert_tree_path(&mut before_root, &before_tree_path);

        if !source_path.exists() {
            skipped_count += 1;
            continue;
        }

        let after_dir = apply_reorganize_pattern(&options.pattern, row);
        let target = target_root
            .join(&after_dir)
            .join(sanitize_component(&row.file_name, "photo"));
        let (resolved_target, action, conflict, skip) =
            resolve_target_collision(&target, &options.collision_strategy, &mut planned_targets);
        if conflict {
            conflict_count += 1;
        }
        if skip {
            skipped_count += 1;
            continue;
        }
        let resolved_after_dir = resolved_target
            .parent()
            .and_then(|p| p.strip_prefix(&target_root).ok())
            .and_then(|p| p.to_str())
            .unwrap_or(&after_dir)
            .replace('\\', "/");
        insert_tree_path(&mut after_root, &resolved_after_dir);
        entries.push(ReorganizePlanEntry {
            photo_id: row.id.clone(),
            file_name: row.file_name.clone(),
            source_path: source_path.to_string_lossy().to_string(),
            target_path: resolved_target.to_string_lossy().to_string(),
            before_dir,
            after_dir: resolved_after_dir,
            action,
            conflict,
        });
    }

    Ok(ReorganizePlanDto {
        id: format!("reorg-{}", uuid::Uuid::new_v4()),
        options,
        total_photos: rows.len() as i64,
        planned_count: entries.len() as i64,
        skipped_count,
        conflict_count,
        before_tree: flatten_tree(before_root, ""),
        after_tree: flatten_tree(after_root, ""),
        entries,
    })
}

#[tauri::command]
pub fn reorganize_execute_plan_cmd(
    entries: Vec<ReorganizePlanEntry>,
    mode: String,
    collision_strategy: String,
    target_root: String,
) -> Result<ReorganizeExecuteSummary, String> {
    let target_root_path = PathBuf::from(target_root);
    std::fs::create_dir_all(&target_root_path)
        .map_err(|e| format!("Failed to create target root: {}", e))?;
    let canonical_target_root = std::fs::canonicalize(&target_root_path)
        .map_err(|e| format!("Failed to canonicalize target root: {}", e))?;

    let mut summary = ReorganizeExecuteSummary {
        attempted: entries.len() as i64,
        completed: 0,
        failed: 0,
        skipped: 0,
        errors: Vec::new(),
    };

    for entry in entries {
        let source = PathBuf::from(&entry.source_path);
        let target = PathBuf::from(&entry.target_path);
        if !source.exists() {
            summary.skipped += 1;
            continue;
        }
        if let Some(parent) = target.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                summary.failed += 1;
                summary
                    .errors
                    .push(format!("{}: mkdir failed: {}", entry.file_name, e));
                continue;
            }
        }
        let canonical_parent = target.parent().and_then(|p| std::fs::canonicalize(p).ok());
        if !canonical_parent
            .as_ref()
            .map(|p| p.starts_with(&canonical_target_root))
            .unwrap_or(false)
        {
            summary.failed += 1;
            summary
                .errors
                .push(format!("{}: target outside root", entry.file_name));
            continue;
        }
        if target.exists() {
            match collision_strategy.as_str() {
                "skip" => {
                    summary.skipped += 1;
                    continue;
                }
                "overwrite" => {}
                _ => {
                    summary.skipped += 1;
                    continue;
                }
            }
        }
        let result = if mode == "move" {
            std::fs::rename(&source, &target)
                .or_else(|_| {
                    std::fs::copy(&source, &target)?;
                    std::fs::remove_file(&source)
                })
                .map(|_| ())
        } else {
            std::fs::copy(&source, &target).map(|_| ())
        };
        match result {
            Ok(()) => summary.completed += 1,
            Err(e) => {
                summary.failed += 1;
                summary.errors.push(format!("{}: {}", entry.file_name, e));
            }
        }
    }

    Ok(summary)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundTaskDto {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub progress_label: Option<String>,
    pub detail: Option<String>,
    pub result: Option<String>,
    pub error: Option<String>,
    pub operation_payload: Option<serde_json::Value>,
    pub resume_checkpoint: Option<serde_json::Value>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

fn background_task_conn(app: &AppHandle) -> Result<rusqlite::Connection, String> {
    let db_path = get_db_path(app)?;
    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    Ok(conn)
}

fn json_to_db(value: &Option<serde_json::Value>) -> Option<String> {
    value.as_ref().map(|v| v.to_string())
}

fn json_from_db(value: Option<String>) -> Option<serde_json::Value> {
    value.and_then(|raw| serde_json::from_str(&raw).ok())
}

#[tauri::command]
pub fn background_tasks_list_cmd(
    app: AppHandle,
    limit: Option<i64>,
) -> Result<Vec<BackgroundTaskDto>, String> {
    let conn = background_task_conn(&app)?;
    let limit = limit.unwrap_or(100).clamp(1, 500);
    let mut stmt = conn
        .prepare(
            "SELECT id, kind, title, description, status, progress_label, detail, result, error, \
                    operation_payload_json, resume_checkpoint_json, created_at, started_at, updated_at, completed_at \
             FROM background_tasks ORDER BY created_at DESC LIMIT ?1",
        )
        .map_err(|e| format!("Failed to prepare background tasks query: {}", e))?;
    let rows = stmt
        .query_map(params![limit], |row| {
            let operation_payload: Option<String> = row.get(9)?;
            let resume_checkpoint: Option<String> = row.get(10)?;
            Ok(BackgroundTaskDto {
                id: row.get(0)?,
                kind: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                status: row.get(4)?,
                progress_label: row.get(5)?,
                detail: row.get(6)?,
                result: row.get(7)?,
                error: row.get(8)?,
                operation_payload: json_from_db(operation_payload),
                resume_checkpoint: json_from_db(resume_checkpoint),
                created_at: row.get(11)?,
                started_at: row.get(12)?,
                updated_at: row.get(13)?,
                completed_at: row.get(14)?,
            })
        })
        .map_err(|e| format!("Failed to query background tasks: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect background tasks: {}", e))?;
    Ok(rows)
}

#[tauri::command]
pub fn background_task_upsert_cmd(
    app: AppHandle,
    mut task: BackgroundTaskDto,
) -> Result<BackgroundTaskDto, String> {
    let conn = background_task_conn(&app)?;
    task.updated_at = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR REPLACE INTO background_tasks \
         (id, kind, title, description, status, progress_label, detail, result, error, \
          operation_payload_json, resume_checkpoint_json, created_at, started_at, updated_at, completed_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        params![
            task.id,
            task.kind,
            task.title,
            task.description,
            task.status,
            task.progress_label,
            task.detail,
            task.result,
            task.error,
            json_to_db(&task.operation_payload),
            json_to_db(&task.resume_checkpoint),
            task.created_at,
            task.started_at,
            task.updated_at,
            task.completed_at,
        ],
    )
    .map_err(|e| format!("Failed to upsert background task: {}", e))?;
    Ok(task)
}

#[tauri::command]
pub fn background_tasks_clear_finished_cmd(app: AppHandle) -> Result<i64, String> {
    let conn = background_task_conn(&app)?;
    let changed = conn
        .execute(
            "DELETE FROM background_tasks WHERE status IN ('succeeded', 'failed')",
            [],
        )
        .map_err(|e| format!("Failed to clear finished background tasks: {}", e))?;
    Ok(changed as i64)
}

#[tauri::command]
pub fn background_tasks_reconcile_startup_cmd(app: AppHandle) -> Result<i64, String> {
    let conn = background_task_conn(&app)?;
    let now = chrono::Utc::now().to_rfc3339();
    let changed = conn
        .execute(
            "UPDATE background_tasks \
             SET status = 'paused', \
                 progress_label = COALESCE(progress_label, 'Interrupted — ready to resume'), \
                 detail = COALESCE(detail, 'The app restarted while this task was active.'), \
                 updated_at = ?1 \
             WHERE status IN ('queued', 'running') AND completed_at IS NULL",
            params![now],
        )
        .map_err(|e| format!("Failed to reconcile background tasks: {}", e))?;
    Ok(changed as i64)
}
