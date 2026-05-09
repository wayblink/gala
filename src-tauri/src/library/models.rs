use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySource {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub status: String,
    pub photo_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSummary {
    pub source: LibrarySource,
    pub indexed_count: i64,
    pub skipped_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub status: String,
    pub root_path: Option<String>,
    pub source_id: Option<String>,
    pub discovered_count: i64,
    pub indexed_count: i64,
    pub thumbnail_ready_count: i64,
    pub thumbnail_failed_count: i64,
    pub skipped_count: i64,
    pub current_file: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySummary {
    pub sources: Vec<LibrarySource>,
    pub total_photos: i64,
    pub recently_added_count: i64,
    pub favorites_count: i64,
    pub hidden_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceFolder {
    pub id: String,
    pub source_id: String,
    pub name: String,
    pub folder_path: String,
    pub depth: i64,
    pub photo_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelinePhoto {
    pub id: String,
    pub file_name: String,
    pub relative_path: String,
    pub folder_path: String,
    pub captured_at: Option<String>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub gps_latitude: Option<f64>,
    pub gps_longitude: Option<f64>,
    pub file_size: i64,
    pub source_name: String,
    pub source_status: String,
    pub thumbnail_path: Option<String>,
    pub is_favorite: bool,
    pub is_hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertedPhoto {
    pub id: String,
    pub absolute_path: String,
    pub needs_thumbnail: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Album {
    pub id: String,
    pub name: String,
    pub photo_count: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterOptions {
    pub cameras: Vec<String>,
    pub extensions: Vec<String>,
    pub date_min: Option<String>,
    pub date_max: Option<String>,
}
