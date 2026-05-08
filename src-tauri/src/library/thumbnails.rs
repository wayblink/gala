use image::{imageops::FilterType, DynamicImage, GenericImageView, ImageFormat};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy)]
pub enum ThumbnailSize {
    Small,
    Medium,
    Large,
}

impl ThumbnailSize {
    pub fn max_dimension(&self) -> u32 {
        match self {
            ThumbnailSize::Small => 200,
            ThumbnailSize::Medium => 400,
            ThumbnailSize::Large => 800,
        }
    }

    pub fn dir_name(&self) -> &'static str {
        match self {
            ThumbnailSize::Small => "small",
            ThumbnailSize::Medium => "medium",
            ThumbnailSize::Large => "large",
        }
    }
}

pub struct ThumbnailGenerator {
    cache_dir: PathBuf,
}

impl ThumbnailGenerator {
    pub fn new(cache_dir: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(&cache_dir)
            .map_err(|e| format!("Failed to create thumbnail cache dir: {}", e))?;

        for size in [
            ThumbnailSize::Small,
            ThumbnailSize::Medium,
            ThumbnailSize::Large,
        ] {
            let size_dir = cache_dir.join(size.dir_name());
            std::fs::create_dir_all(&size_dir)
                .map_err(|e| format!("Failed to create thumbnail size dir: {}", e))?;
        }

        Ok(Self { cache_dir })
    }

    pub fn generate(
        &self,
        photo_id: &str,
        source_path: &Path,
        size: ThumbnailSize,
    ) -> Result<PathBuf, String> {
        let img = image::open(source_path).map_err(|e| format!("Failed to open image: {}", e))?;

        let thumbnail = self.resize_image(&img, size);

        let output_path = self
            .cache_dir
            .join(size.dir_name())
            .join(format!("{}.jpg", photo_id));

        thumbnail
            .save_with_format(&output_path, ImageFormat::Jpeg)
            .map_err(|e| format!("Failed to save thumbnail: {}", e))?;

        Ok(output_path)
    }

    pub fn generate_all(
        &self,
        photo_id: &str,
        source_path: &Path,
    ) -> Result<ThumbnailPaths, String> {
        let img = image::open(source_path).map_err(|e| format!("Failed to open image: {}", e))?;

        let small = self.save_resized_image(photo_id, &img, ThumbnailSize::Small)?;
        let medium = self.save_resized_image(photo_id, &img, ThumbnailSize::Medium)?;
        let large = self.save_resized_image(photo_id, &img, ThumbnailSize::Large)?;
        let (original_width, original_height) = img.dimensions();

        Ok(ThumbnailPaths {
            small: small.to_string_lossy().to_string(),
            medium: medium.to_string_lossy().to_string(),
            large: large.to_string_lossy().to_string(),
            original_width,
            original_height,
        })
    }

    fn save_resized_image(
        &self,
        photo_id: &str,
        img: &DynamicImage,
        size: ThumbnailSize,
    ) -> Result<PathBuf, String> {
        let thumbnail = self.resize_image(img, size);

        let output_path = self.get_thumbnail_path(photo_id, size);

        thumbnail
            .save_with_format(&output_path, ImageFormat::Jpeg)
            .map_err(|e| format!("Failed to save thumbnail: {}", e))?;

        Ok(output_path)
    }

    fn resize_image(&self, img: &DynamicImage, size: ThumbnailSize) -> DynamicImage {
        let max_dim = size.max_dimension();
        let (width, height) = img.dimensions();

        if width <= max_dim && height <= max_dim {
            return img.clone();
        }

        let ratio = (max_dim as f32) / width.max(height) as f32;
        let new_width = (width as f32 * ratio) as u32;
        let new_height = (height as f32 * ratio) as u32;

        // Use Triangle filter for faster thumbnail generation
        // Triangle is ~10x faster than Lanczos3 with acceptable quality
        img.resize(new_width, new_height, FilterType::Triangle)
    }

    pub fn get_thumbnail_path(&self, photo_id: &str, size: ThumbnailSize) -> PathBuf {
        self.cache_dir
            .join(size.dir_name())
            .join(format!("{}.jpg", photo_id))
    }
}

#[derive(Debug, Clone)]
pub struct ThumbnailPaths {
    pub small: String,
    pub medium: String,
    pub large: String,
    pub original_width: u32,
    pub original_height: u32,
}
