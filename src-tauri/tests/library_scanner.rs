use gala_lib::library::scanner::discover_photos;
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
