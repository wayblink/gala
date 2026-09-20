use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use crate::library::raw::is_raw_extension;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiscoveredPhoto {
    pub absolute_path: PathBuf,
    pub file_name: String,
    pub extension: String,
    pub file_size: u64,
    pub file_mtime: i64,
}

const SUPPORTED_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "heic", "heif", "hif", "webp", "tif", "tiff",
];

pub fn discover_photos(root_path: &Path) -> Result<Vec<DiscoveredPhoto>, String> {
    discover_photos_with_progress(root_path, |_, _| {})
}

pub fn discover_photos_with_progress<F>(
    root_path: &Path,
    mut on_photo_discovered: F,
) -> Result<Vec<DiscoveredPhoto>, String>
where
    F: FnMut(usize, &str),
{
    ensure_source_directory(root_path)?;
    let mut photos = Vec::new();

    for entry in WalkDir::new(root_path)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| entry.file_name() != ".gala")
        .filter_map(|e| e.ok())
    {
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("");

        if file_name.starts_with("._") {
            continue;
        }

        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        if !SUPPORTED_EXTENSIONS.contains(&extension.as_str()) && !is_raw_extension(&extension) {
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

        let discovered_photo = DiscoveredPhoto {
            absolute_path: path.to_path_buf(),
            file_name: file_name.to_string(),
            extension,
            file_size: metadata.len(),
            file_mtime,
        };

        on_photo_discovered(photos.len() + 1, &discovered_photo.file_name);
        photos.push(discovered_photo);
    }

    photos.sort_by(|a, b| a.absolute_path.cmp(&b.absolute_path));

    Ok(photos)
}

/// Fail closed when a source root is unavailable. An unavailable root must
/// never be treated as an empty collection during a rescan.
pub fn ensure_source_directory(root_path: &Path) -> Result<(), String> {
    let metadata = std::fs::metadata(root_path).map_err(|e| {
        format!(
            "Source folder is unavailable: {} ({})",
            root_path.display(),
            e
        )
    })?;
    if !metadata.is_dir() {
        return Err(format!(
            "Source path is not a folder: {}",
            root_path.display()
        ));
    }
    std::fs::read_dir(root_path).map_err(|e| {
        format!(
            "Source folder cannot be read: {} ({})",
            root_path.display(),
            e
        )
    })?;
    Ok(())
}
