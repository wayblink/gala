use gala_lib::library::thumbnails::{ThumbnailGenerator, ThumbnailSize};
use image::GenericImageView;
use std::fs;
use tempfile::TempDir;

#[test]
fn test_generates_thumbnail_from_jpeg() {
    let temp_dir = TempDir::new().unwrap();
    let cache_dir = temp_dir.path().join("thumbnails");
    let source_dir = temp_dir.path().join("source");
    fs::create_dir(&source_dir).unwrap();

    // Create a simple test image (1x1 red pixel JPEG)
    let test_image = image::RgbImage::from_pixel(100, 100, image::Rgb([255, 0, 0]));
    let test_path = source_dir.join("test.jpg");
    test_image.save(&test_path).unwrap();

    let generator = ThumbnailGenerator::new(cache_dir.clone()).unwrap();
    let result = generator.generate("photo-1", &test_path, ThumbnailSize::Small);

    assert!(result.is_ok());
    let thumbnail_path = result.unwrap();
    assert!(thumbnail_path.exists());
    assert!(thumbnail_path.to_string_lossy().contains("small"));
}

#[test]
fn test_generates_all_sizes() {
    let temp_dir = TempDir::new().unwrap();
    let cache_dir = temp_dir.path().join("thumbnails");
    let source_dir = temp_dir.path().join("source");
    fs::create_dir(&source_dir).unwrap();

    let test_image = image::RgbImage::from_pixel(800, 600, image::Rgb([0, 255, 0]));
    let test_path = source_dir.join("test.jpg");
    test_image.save(&test_path).unwrap();

    let generator = ThumbnailGenerator::new(cache_dir.clone()).unwrap();
    let result = generator.generate_all("photo-2", &test_path);

    assert!(result.is_ok());
    let paths = result.unwrap();

    assert!(std::path::Path::new(&paths.small).exists());
    assert!(std::path::Path::new(&paths.medium).exists());
    assert!(std::path::Path::new(&paths.large).exists());
}

#[test]
fn test_maintains_aspect_ratio() {
    let temp_dir = TempDir::new().unwrap();
    let cache_dir = temp_dir.path().join("thumbnails");
    let source_dir = temp_dir.path().join("source");
    fs::create_dir(&source_dir).unwrap();

    // Create a 1000x500 image (2:1 aspect ratio)
    let test_image = image::RgbImage::from_pixel(1000, 500, image::Rgb([0, 0, 255]));
    let test_path = source_dir.join("test.jpg");
    test_image.save(&test_path).unwrap();

    let generator = ThumbnailGenerator::new(cache_dir.clone()).unwrap();
    let thumbnail_path = generator
        .generate("photo-3", &test_path, ThumbnailSize::Small)
        .unwrap();

    let thumbnail = image::open(&thumbnail_path).unwrap();
    let (width, height) = thumbnail.dimensions();

    // Should be 200x100 (maintaining 2:1 ratio, max dimension 200)
    assert_eq!(width, 200);
    assert_eq!(height, 100);
}

#[test]
fn test_handles_corrupted_image() {
    let temp_dir = TempDir::new().unwrap();
    let cache_dir = temp_dir.path().join("thumbnails");
    let source_dir = temp_dir.path().join("source");
    fs::create_dir(&source_dir).unwrap();

    // Create a corrupted file
    let test_path = source_dir.join("corrupted.jpg");
    fs::write(&test_path, b"not a valid image").unwrap();

    let generator = ThumbnailGenerator::new(cache_dir.clone()).unwrap();
    let result = generator.generate("photo-4", &test_path, ThumbnailSize::Small);

    assert!(result.is_err());
}

#[test]
fn test_creates_size_directories() {
    let temp_dir = TempDir::new().unwrap();
    let cache_dir = temp_dir.path().join("thumbnails");

    let _generator = ThumbnailGenerator::new(cache_dir.clone()).unwrap();

    assert!(cache_dir.join("small").exists());
    assert!(cache_dir.join("medium").exists());
    assert!(cache_dir.join("large").exists());
}

#[test]
#[ignore = "requires GALA_RAW_TEST_IMAGE to point to a real camera RAW file"]
fn test_generates_all_thumbnail_sizes_from_real_raw_fixture() {
    let source_path = std::env::var("GALA_RAW_TEST_IMAGE")
        .expect("GALA_RAW_TEST_IMAGE must point to a real camera RAW file");
    let temp_dir = TempDir::new().unwrap();
    let cache_dir = temp_dir.path().join("thumbnails");
    let generator = ThumbnailGenerator::new(cache_dir).unwrap();

    let paths = generator
        .generate_all("raw-photo", std::path::Path::new(&source_path))
        .unwrap();

    for path in [&paths.small, &paths.medium, &paths.large] {
        let thumbnail = image::open(path).unwrap();
        let (width, height) = thumbnail.dimensions();
        assert!(width > 0 && height > 0);
        assert!(width <= 800 && height <= 800);
    }
    assert!(paths.original_width > 0);
    assert!(paths.original_height > 0);
}
