use crate::library::models::{LibrarySummary, ScanSummary};
use crate::library::scanner::discover_photos;
use crate::library::storage::{
    get_library_summary as get_summary, initialize_schema, open_database, replace_source_photos,
    upsert_source,
};
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
