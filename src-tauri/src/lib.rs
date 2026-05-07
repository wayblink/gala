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
        .invoke_handler(tauri::generate_handler![get_app_environment])
        .run(tauri::generate_context!())
        .expect("failed to run Gala desktop app");
}
