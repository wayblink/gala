pub mod capability;
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
            library::commands::apple_photos_status_cmd,
            library::commands::connect_apple_photos_cmd,
            library::commands::scan_photo_source,
            library::commands::relink_photo_source,
            library::commands::get_library_summary,
            library::commands::get_timeline_photos_cmd,
            library::commands::get_source_folders_cmd,
            library::commands::get_source_collections_cmd,
            library::commands::get_source_collection_photos_cmd,
            library::commands::get_thumbnail_file,
            library::commands::download_apple_photos_thumbnail_cmd,
            library::commands::download_apple_photos_original_cmd,
            library::commands::download_apple_photos_originals_cmd,
            library::commands::get_photo_data_url,
            library::commands::get_recently_added_photos_cmd,
            library::commands::get_favorite_photos_cmd,
            library::commands::search_photos_cmd,
            library::commands::toggle_photo_favorite_cmd,
            library::commands::toggle_photo_hidden_cmd,
            library::commands::get_hidden_photos_cmd,
            library::commands::get_filter_options_cmd,
            library::commands::get_filtered_photos_cmd,
            library::commands::get_albums_cmd,
            library::commands::create_album_cmd,
            library::commands::delete_album_cmd,
            library::commands::rename_album_cmd,
            library::commands::rename_source_cmd,
            library::commands::add_photo_to_album_cmd,
            library::commands::remove_photo_from_album_cmd,
            library::commands::get_album_photos_cmd,
            library::commands::get_photos_by_person_cmd,
            library::commands::add_photos_to_album_batch_cmd,
            library::commands::remove_photos_from_album_batch_cmd,
            library::commands::delete_source_cmd,
            library::commands::set_photos_favorite_batch_cmd,
            library::commands::set_photos_hidden_batch_cmd,
            library::commands::add_tags_to_photos_batch_cmd,
            library::commands::get_photo_tags_cmd,
            library::commands::set_photo_tags_cmd,
            library::commands::get_all_tags_cmd,
            library::commands::get_labels_cmd,
            library::commands::materialize_content_labels_cmd,
            library::commands::get_photos_by_label_cmd,
            library::commands::sync_person_labels_cmd,
            library::commands::get_photos_by_tag_cmd,
            library::commands::open_source_folder_cmd,
            library::commands::reveal_in_finder_cmd,
            library::commands::reorganize_scan_plan_cmd,
            library::commands::reorganize_execute_plan_cmd,
            library::commands::reorganize_continue_cmd,
            library::commands::reorganize_rollback_cmd,
            library::commands::background_tasks_list_cmd,
            library::commands::background_task_upsert_cmd,
            library::commands::background_tasks_clear_finished_cmd,
            library::commands::background_tasks_reconcile_startup_cmd,
            capability::commands::analysis_request_cmd,
            capability::commands::analysis_job_cmd,
            capability::commands::analysis_results_cmd,
            capability::commands::capabilities_list_cmd,
            capability::commands::faces_list_cmd,
            capability::commands::faces_summary_cmd,
            capability::commands::analysis_embed_faces_cmd,
            capability::commands::analysis_cluster_faces_cmd,
            capability::commands::persons_list_cmd,
            capability::commands::set_person_name_cmd,
            capability::commands::set_person_hidden_cmd,
            capability::commands::merge_persons_cmd,
            capability::commands::split_face_to_new_person_cmd,
            capability::commands::analysis_embed_photos_cmd,
            capability::commands::photo_embeddings_by_ids_cmd,
            capability::commands::photo_embeddings_summary_cmd,
            capability::commands::read_artifact_bytes_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Gala desktop app");
}
