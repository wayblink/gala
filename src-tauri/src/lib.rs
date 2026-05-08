pub mod library;

#[derive(serde::Serialize)]
struct AppEnvironment {
    runtime: &'static str,
    platform: &'static str,
    engine: &'static str,
}

#[tauri::command]
fn get_app_environment() -> AppEnvironment {
    AppEnvironment {
        runtime: "desktop",
        platform: std::env::consts::OS,
        engine: "rust",
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_app_environment,
            library::commands::pick_photo_folder,
            library::commands::scan_photo_source,
            library::commands::get_library_summary,
            library::commands::get_timeline_photos_cmd,
            library::commands::get_source_folders_cmd,
            library::commands::get_thumbnail_file,
            library::commands::get_photo_data_url,
            library::commands::get_recently_added_photos_cmd,
            library::commands::get_favorite_photos_cmd,
            library::commands::search_photos_cmd,
            library::commands::toggle_photo_favorite_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Gala desktop app");
}
