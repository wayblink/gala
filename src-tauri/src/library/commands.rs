use crate::library::models::{LibrarySummary, ScanSummary};
use crate::library::scanner::discover_photos;
use crate::library::storage::{
    get_library_summary as get_summary, initialize_schema, mark_photo_assets_failed,
    open_database, replace_source_photos, upsert_photo_assets, upsert_source,
};
use crate::library::thumbnails::ThumbnailGenerator;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

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

    let folder = app
        .dialog()
        .file()
        .blocking_pick_folder();

    match folder {
        Some(path) => {
            let path_buf = path.as_path()
                .ok_or_else(|| "Failed to convert path".to_string())?;
            Ok(Some(
                path_buf.to_str()
                    .ok_or_else(|| "Invalid folder path".to_string())?
                    .to_string(),
            ))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub fn scan_photo_source(app: AppHandle, root_path: String) -> Result<ScanSummary, String> {
    let db_path = get_db_path(&app)?;
    let mut conn = open_database(&db_path)?;
    initialize_schema(&conn)?;

    let source_path = PathBuf::from(&root_path);
    let source = upsert_source(&conn, &source_path)?;

    let photos = discover_photos(&source_path)?;
    let indexed_count = photos.len() as i64;

    replace_source_photos(&mut conn, &source.id, &source_path, &photos)?;

    // Generate thumbnails for all photos
    let thumbnail_cache = get_thumbnail_cache_dir(&app)?;
    let thumbnail_gen = ThumbnailGenerator::new(thumbnail_cache)?;

    // Get photo IDs from database
    let mut stmt = conn
        .prepare("SELECT id, absolute_path_snapshot FROM photos WHERE source_id = ?1")
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let photo_rows: Vec<(String, String)> = stmt
        .query_map([&source.id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| format!("Failed to query photos: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect photos: {}", e))?;

    for (photo_id, photo_path) in photo_rows {
        match thumbnail_gen.generate_all(&photo_id, &PathBuf::from(&photo_path)) {
            Ok(paths) => {
                if let Err(e) = upsert_photo_assets(
                    &conn,
                    &photo_id,
                    &paths.small,
                    &paths.medium,
                    &paths.large,
                ) {
                    eprintln!("Failed to save thumbnail paths for {}: {}", photo_id, e);
                }
            }
            Err(e) => {
                eprintln!("Failed to generate thumbnails for {}: {}", photo_id, e);
                if let Err(e) = mark_photo_assets_failed(&conn, &photo_id) {
                    eprintln!("Failed to mark assets as failed for {}: {}", photo_id, e);
                }
            }
        }
    }

    let updated_source = upsert_source(&conn, &source_path)?;

    Ok(ScanSummary {
        source: updated_source,
        indexed_count,
        skipped_count: 0,
    })
}

#[tauri::command]
pub fn get_library_summary(app: AppHandle) -> Result<LibrarySummary, String> {
    let db_path = get_db_path(&app)?;

    if !db_path.exists() {
        return Ok(LibrarySummary {
            sources: vec![],
            total_photos: 0,
        });
    }

    let conn = open_database(&db_path)?;
    initialize_schema(&conn)?;
    get_summary(&conn)
}
