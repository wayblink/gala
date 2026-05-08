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
    pub file_size: i64,
    pub source_name: String,
    pub source_status: String,
    pub thumbnail_path: Option<String>,
    pub is_favorite: bool,
}
