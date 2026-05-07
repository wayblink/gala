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
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Gala desktop app");
}
