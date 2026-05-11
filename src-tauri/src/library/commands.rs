use crate::library::exif::extract_exif_metadata;
use crate::library::models::{
    Album, FilterOptions, LibrarySummary, ScanProgress, ScanSummary, SourceFolder, Tag,
    TimelinePhoto,
};
use crate::library::scanner::discover_photos_with_progress;
use crate::library::storage::{
    add_photo_to_album, add_photos_to_album_batch, add_tags_to_photos_batch, create_album,
    delete_album, delete_source, get_album_photos, get_albums, get_all_tags, get_favorite_photos,
    get_filter_options, get_filtered_photos, get_hidden_photos, get_library_summary as get_summary,
    get_photo_original_path, get_photo_tags, get_photos_by_tag, get_recently_added_photos,
    get_source_folders, get_timeline_photos, initialize_schema, mark_photo_assets_failed,
    migrate_schema, open_database, remove_photo_from_album, remove_photos_from_album_batch,
    rename_album, search_photos, set_photo_favorite, set_photo_hidden, set_photo_tags,
    set_photos_favorite_batch, set_photos_hidden_batch, update_photo_dimensions,
    update_photo_exif_metadata, upsert_photo_assets, upsert_source, upsert_source_photos,
};
use crate::library::thumbnails::ThumbnailGenerator;
use base64::{engine::general_purpose, Engine as _};
use rusqlite::params;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

const MAX_VIEWER_ORIGINAL_BYTES: u64 = 50 * 1024 * 1024;
const SCAN_PROGRESS_EVENT: &str = "gala://scan-progress";

fn get_db_path(app: &AppHandle) -> Result<PathBuf, String> {
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
        eprintln!("[scan_photo_source] Generating thumbnails for: {}", photo_path);
        let current_file = PathBuf::from(photo_path)
            .file_name()
            .and_then(|f| f.to_str())
            .map(|f| f.to_string());

        match thumbnail_gen.generate_all(photo_id, &PathBuf::from(photo_path)) {
            Ok(paths) => {
                thumbnail_ready_count += 1;
                eprintln!("[scan_photo_source] Generated thumbnails: small={}, medium={}, large={}",
                    paths.small, paths.medium, paths.large);
                if let Err(e) = upsert_photo_assets(&conn, photo_id, &paths.small, &paths.medium, &paths.large) {
                    eprintln!("Failed to save thumbnail paths for {}: {}", photo_id, e);
                }
                if let Err(e) = update_photo_dimensions(&conn, photo_id, paths.original_width, paths.original_height) {
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
                    &conn, photo_id,
                    metadata.captured_at.as_deref(), metadata.camera_make.as_deref(),
                    metadata.camera_model.as_deref(), metadata.lens_model.as_deref(),
                    metadata.gps_latitude, metadata.gps_longitude,
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
        .query_row("SELECT hidden_at FROM photos WHERE id = ?1", params![photo_id], |row| row.get(0))
        .map_err(|e| format!("Failed to query photo: {}", e))?;
    let new_state = current.is_none();
    set_photo_hidden(&conn, &photo_id, new_state)?;
    Ok(new_state)
}

#[tauri::command]
pub fn get_hidden_photos_cmd(app: AppHandle, limit: i64, offset: i64) -> Result<Vec<TimelinePhoto>, String> {
    let db_path = get_db_path(&app)?;
    if !db_path.exists() { return Ok(vec![]); }
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
    if !db_path.exists() { return Ok(vec![]); }
    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    get_filtered_photos(
        &conn, limit, offset,
        source_id.as_deref(), folder_path.as_deref(),
        &cameras, date_from.as_deref(), date_to.as_deref(), &extensions,
    )
}

#[tauri::command]
pub fn get_albums_cmd(app: AppHandle) -> Result<Vec<Album>, String> {
    let db_path = get_db_path(&app)?;
    if !db_path.exists() { return Ok(vec![]); }
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
pub fn add_photo_to_album_cmd(app: AppHandle, album_id: String, photo_id: String) -> Result<(), String> {
    let conn = open_conn(&app)?;
    add_photo_to_album(&conn, &album_id, &photo_id)
}

#[tauri::command]
pub fn remove_photo_from_album_cmd(app: AppHandle, album_id: String, photo_id: String) -> Result<(), String> {
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
    if !db_path.exists() { return Ok(vec![]); }
    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    get_album_photos(&conn, &album_id, limit, offset)
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
    if !db_path.exists() { return Ok(vec![]); }
    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    migrate_schema(&conn)?;
    get_all_tags(&conn)
}

#[tauri::command]
pub fn get_photos_by_tag_cmd(
    app: AppHandle,
    tag_name: String,
    limit: i64,
    offset: i64,
) -> Result<Vec<TimelinePhoto>, String> {
    let db_path = get_db_path(&app)?;
    if !db_path.exists() { return Ok(vec![]); }
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
