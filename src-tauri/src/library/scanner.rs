use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiscoveredPhoto {
    pub absolute_path: PathBuf,
    pub file_name: String,
    pub extension: String,
    pub file_size: u64,
    pub file_mtime: i64,
}

const SUPPORTED_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "heic", "webp", "tif", "tiff"];

pub fn discover_photos(root_path: &Path) -> Result<Vec<DiscoveredPhoto>, String> {
    let mut photos = Vec::new();

    for entry in WalkDir::new(root_path)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        if !SUPPORTED_EXTENSIONS.contains(&extension.as_str()) {
            continue;
        }

        let metadata = match std::fs::metadata(path) {
            Ok(m) => m,
            Err(e) => {
                eprintln!("Failed to read metadata for {:?}: {}", path, e);
                continue;
            }
        };

        let file_mtime = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        photos.push(DiscoveredPhoto {
            absolute_path: path.to_path_buf(),
            file_name: path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string(),
            extension,
            file_size: metadata.len(),
            file_mtime,
        });
    }

    photos.sort_by(|a, b| a.absolute_path.cmp(&b.absolute_path));

    Ok(photos)
}
