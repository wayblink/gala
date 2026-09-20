use gala_lib::library::scanner::{discover_photos, discover_photos_with_progress};
use std::fs;
use tempfile::TempDir;

#[test]
fn test_discovers_supported_files_recursively() {
    let temp_dir = TempDir::new().unwrap();
    let root = temp_dir.path();

    fs::write(root.join("photo1.jpg"), b"fake jpg").unwrap();
    fs::write(root.join("photo2.PNG"), b"fake png").unwrap();
    fs::create_dir(root.join("subdir")).unwrap();
    fs::write(root.join("subdir/photo3.jpeg"), b"fake jpeg").unwrap();

    let photos = discover_photos(root).unwrap();

    assert_eq!(photos.len(), 3);
    assert!(photos.iter().any(|p| p.file_name == "photo1.jpg"));
    assert!(photos.iter().any(|p| p.file_name == "photo2.PNG"));
    assert!(photos.iter().any(|p| p.file_name == "photo3.jpeg"));
}

#[test]
fn test_rejects_missing_source_root_instead_of_returning_empty() {
    let temp_dir = TempDir::new().unwrap();
    let missing = temp_dir.path().join("ejected-volume");

    let error = discover_photos(&missing).unwrap_err();

    assert!(error.contains("Source folder is unavailable"));
}

#[test]
fn test_rejects_file_as_source_root() {
    let temp_dir = TempDir::new().unwrap();
    let file = temp_dir.path().join("photo.jpg");
    fs::write(&file, b"not a folder").unwrap();

    let error = discover_photos(&file).unwrap_err();

    assert!(error.contains("Source path is not a folder"));
}

#[test]
fn test_ignores_unsupported_files() {
    let temp_dir = TempDir::new().unwrap();
    let root = temp_dir.path();

    fs::write(root.join("photo.jpg"), b"fake jpg").unwrap();
    fs::write(root.join("document.txt"), b"text file").unwrap();
    fs::write(root.join("video.mp4"), b"video file").unwrap();

    let photos = discover_photos(root).unwrap();

    assert_eq!(photos.len(), 1);
    assert_eq!(photos[0].file_name, "photo.jpg");
}

#[test]
fn test_ignores_appledouble_files_without_ignoring_other_dotfiles() {
    let temp_dir = TempDir::new().unwrap();
    let root = temp_dir.path();

    fs::write(root.join("photo.jpg"), b"fake jpg").unwrap();
    fs::write(root.join(".favorite.jpg"), b"fake hidden jpg").unwrap();
    fs::write(root.join("._photo.jpg"), b"appledouble metadata").unwrap();
    fs::create_dir(root.join("nested")).unwrap();
    fs::write(root.join("nested/._photo.PNG"), b"appledouble metadata").unwrap();

    let mut progress = Vec::new();
    let photos = discover_photos_with_progress(root, |count, file_name| {
        progress.push((count, file_name.to_string()));
    })
    .unwrap();

    assert_eq!(
        photos
            .iter()
            .map(|photo| photo.file_name.as_str())
            .collect::<Vec<_>>(),
        vec![".favorite.jpg", "photo.jpg"]
    );
    assert_eq!(
        progress
            .iter()
            .map(|(_, file_name)| file_name.as_str())
            .collect::<Vec<_>>(),
        vec![".favorite.jpg", "photo.jpg"]
    );
}

#[test]
fn test_ignores_gala_sidecar_contents() {
    let temp_dir = TempDir::new().unwrap();
    let root = temp_dir.path();
    fs::write(root.join("photo.jpg"), b"fake jpg").unwrap();
    fs::create_dir_all(root.join(".gala/thumbnails/small")).unwrap();
    fs::write(
        root.join(".gala/thumbnails/small/generated.jpg"),
        b"thumbnail",
    )
    .unwrap();

    let photos = discover_photos(root).unwrap();

    assert_eq!(photos.len(), 1);
    assert_eq!(photos[0].file_name, "photo.jpg");
}

#[test]
fn test_extension_matching_is_case_insensitive() {
    let temp_dir = TempDir::new().unwrap();
    let root = temp_dir.path();

    fs::write(root.join("photo1.JPG"), b"fake").unwrap();
    fs::write(root.join("photo2.Jpg"), b"fake").unwrap();
    fs::write(root.join("photo3.jpg"), b"fake").unwrap();

    let photos = discover_photos(root).unwrap();

    assert_eq!(photos.len(), 3);
    assert!(photos.iter().all(|p| p.extension == "jpg"));
}

#[test]
fn test_discovers_common_raw_formats_case_insensitively() {
    let temp_dir = TempDir::new().unwrap();
    let root = temp_dir.path();
    let raw_files = [
        "canon.CR2",
        "canon.cr3",
        "nikon.NEF",
        "sony.ARW",
        "fuji.RAF",
        "olympus.ORF",
        "panasonic.RW2",
        "pentax.PEF",
        "samsung.SRW",
        "portable.DNG",
    ];

    for file_name in raw_files {
        fs::write(root.join(file_name), b"raw fixture placeholder").unwrap();
    }

    let photos = discover_photos(root).unwrap();

    assert_eq!(photos.len(), raw_files.len());
    let mut extensions = photos
        .iter()
        .map(|photo| photo.extension.as_str())
        .collect::<Vec<_>>();
    extensions.sort_unstable();
    assert_eq!(
        extensions,
        vec!["arw", "cr2", "cr3", "dng", "nef", "orf", "pef", "raf", "rw2", "srw"]
    );
}

#[test]
fn test_discovers_heif_family_extensions_case_insensitively() {
    let temp_dir = TempDir::new().unwrap();
    let root = temp_dir.path();

    for file_name in ["photo.HEIC", "photo2.HEIF", "photo3.HIF"] {
        fs::write(root.join(file_name), b"heif fixture placeholder").unwrap();
    }

    let photos = discover_photos(root).unwrap();
    let mut extensions = photos
        .iter()
        .map(|photo| photo.extension.as_str())
        .collect::<Vec<_>>();
    extensions.sort_unstable();

    assert_eq!(extensions, vec!["heic", "heif", "hif"]);
}

#[test]
fn test_returns_deterministic_path_ordering() {
    let temp_dir = TempDir::new().unwrap();
    let root = temp_dir.path();

    fs::write(root.join("c.jpg"), b"fake").unwrap();
    fs::write(root.join("a.jpg"), b"fake").unwrap();
    fs::write(root.join("b.jpg"), b"fake").unwrap();

    let photos = discover_photos(root).unwrap();

    assert_eq!(photos.len(), 3);
    assert_eq!(photos[0].file_name, "a.jpg");
    assert_eq!(photos[1].file_name, "b.jpg");
    assert_eq!(photos[2].file_name, "c.jpg");
}

#[test]
fn test_extracts_file_metadata() {
    let temp_dir = TempDir::new().unwrap();
    let root = temp_dir.path();

    let content = b"fake image content";
    fs::write(root.join("photo.jpg"), content).unwrap();

    let photos = discover_photos(root).unwrap();

    assert_eq!(photos.len(), 1);
    let photo = &photos[0];
    assert_eq!(photo.file_size, content.len() as u64);
    assert!(photo.file_mtime > 0);
    assert_eq!(photo.extension, "jpg");
}

#[test]
fn test_reports_discovery_progress_for_supported_files() {
    let temp_dir = TempDir::new().unwrap();
    let root = temp_dir.path();

    fs::write(root.join("photo1.jpg"), b"fake").unwrap();
    fs::write(root.join("photo2.png"), b"fake").unwrap();
    fs::write(root.join("notes.txt"), b"ignore").unwrap();

    let mut progress = Vec::new();
    let photos = discover_photos_with_progress(root, |count, file_name| {
        progress.push((count, file_name.to_string()));
    })
    .unwrap();

    assert_eq!(photos.len(), 2);
    assert_eq!(progress.len(), 2);
    assert_eq!(progress[0].0, 1);
    assert_eq!(progress[1].0, 2);
    assert!(progress
        .iter()
        .any(|(_, file_name)| file_name == "photo1.jpg"));
    assert!(progress
        .iter()
        .any(|(_, file_name)| file_name == "photo2.png"));
}
