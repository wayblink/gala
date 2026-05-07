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
pub struct LibrarySummary {
    pub sources: Vec<LibrarySource>,
    pub total_photos: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelinePhoto {
    pub id: String,
    pub file_name: String,
    pub captured_at: Option<String>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub thumbnail_path: Option<String>,
}
