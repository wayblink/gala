use gala_lib::library::scanner::discover_photos;
use gala_lib::library::thumbnails::ThumbnailGenerator;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Instant;

#[derive(Serialize)]
struct BenchmarkResult {
    root: String,
    discovered: usize,
    discovery_ms: u128,
    discovery_photos_per_second: f64,
    thumbnail_limit: usize,
    thumbnails_generated: usize,
    thumbnail_failures: usize,
    thumbnail_ms: u128,
    thumbnail_photos_per_second: f64,
    cache_bytes: u64,
}

fn directory_bytes(root: &Path) -> u64 {
    walkdir::WalkDir::new(root)
        .into_iter()
        .filter_map(Result::ok)
        .filter_map(|entry| entry.metadata().ok())
        .filter(|metadata| metadata.is_file())
        .map(|metadata| metadata.len())
        .sum()
}

fn rate(count: usize, elapsed_ms: u128) -> f64 {
    if elapsed_ms == 0 {
        return count as f64;
    }
    count as f64 / (elapsed_ms as f64 / 1_000.0)
}

fn main() -> Result<(), String> {
    let mut args = std::env::args().skip(1);
    let root = args
        .next()
        .map(PathBuf::from)
        .ok_or_else(|| "usage: cargo run --release --example library_benchmark -- <photo-root> [thumbnail-limit]".to_string())?;
    let requested_limit = args
        .next()
        .map(|value| value.parse::<usize>())
        .transpose()
        .map_err(|error| format!("invalid thumbnail limit: {error}"))?
        .unwrap_or(1_000);

    let discovery_started = Instant::now();
    let photos = discover_photos(&root)?;
    let discovery_ms = discovery_started.elapsed().as_millis();

    let cache = tempfile::tempdir().map_err(|error| format!("create temp cache: {error}"))?;
    let generator = ThumbnailGenerator::new(cache.path().to_path_buf())?;
    let thumbnail_limit = requested_limit.min(photos.len());
    let thumbnail_started = Instant::now();
    let mut thumbnails_generated = 0;
    let mut thumbnail_failures = 0;

    for (index, photo) in photos.iter().take(thumbnail_limit).enumerate() {
        match generator.generate_all(&format!("benchmark-{index}"), &photo.absolute_path) {
            Ok(_) => thumbnails_generated += 1,
            Err(_) => thumbnail_failures += 1,
        }
    }
    let thumbnail_ms = thumbnail_started.elapsed().as_millis();

    let result = BenchmarkResult {
        root: root.to_string_lossy().to_string(),
        discovered: photos.len(),
        discovery_ms,
        discovery_photos_per_second: rate(photos.len(), discovery_ms),
        thumbnail_limit,
        thumbnails_generated,
        thumbnail_failures,
        thumbnail_ms,
        thumbnail_photos_per_second: rate(thumbnails_generated, thumbnail_ms),
        cache_bytes: directory_bytes(cache.path()),
    };

    println!(
        "{}",
        serde_json::to_string_pretty(&result)
            .map_err(|error| format!("serialize benchmark result: {error}"))?
    );
    Ok(())
}
