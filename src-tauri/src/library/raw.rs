use std::path::Path;

pub const RAW_EXTENSIONS: &[&str] = &[
    "3fr", "arw", "cr2", "cr3", "dcr", "dng", "erf", "iiq", "kdc", "mef", "mos", "mrw", "nef",
    "nrw", "orf", "pef", "raf", "raw", "rwl", "rw2", "sr2", "srw", "x3f",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RawPreviewMetadata {
    pub original_width: u32,
    pub original_height: u32,
}

pub fn is_raw_extension(extension: &str) -> bool {
    RAW_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
}

pub fn is_raw_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(is_raw_extension)
}

#[cfg(target_os = "macos")]
pub fn write_raw_preview(
    source_path: &Path,
    output_path: &Path,
    max_dimension: u32,
) -> Result<RawPreviewMetadata, String> {
    macos::write_raw_preview(source_path, output_path, max_dimension)
}

#[cfg(not(target_os = "macos"))]
pub fn write_raw_preview(
    _source_path: &Path,
    _output_path: &Path,
    _max_dimension: u32,
) -> Result<RawPreviewMetadata, String> {
    Err("RAW decoding is currently available on macOS only".to_string())
}

#[cfg(target_os = "macos")]
mod macos {
    use super::RawPreviewMetadata;
    use objc2_core_foundation::{CFBoolean, CFDictionary, CFNumber, CFString, CFType, CFURL};
    use objc2_core_graphics::CGImage;
    use objc2_image_io::{
        kCGImageDestinationLossyCompressionQuality, kCGImagePropertyPixelHeight,
        kCGImagePropertyPixelWidth, kCGImageSourceCreateThumbnailFromImageAlways,
        kCGImageSourceCreateThumbnailWithTransform, kCGImageSourceThumbnailMaxPixelSize,
        CGImageDestination, CGImageSource,
    };
    use std::path::Path;

    pub fn write_raw_preview(
        source_path: &Path,
        output_path: &Path,
        max_dimension: u32,
    ) -> Result<RawPreviewMetadata, String> {
        if max_dimension == 0 {
            return Err("RAW preview max dimension must be greater than zero".to_string());
        }

        let source_url = CFURL::from_file_path(source_path)
            .ok_or_else(|| format!("Invalid RAW source path: {}", source_path.display()))?;
        let source = unsafe { CGImageSource::with_url(&source_url, None) }
            .ok_or_else(|| format!("ImageIO could not open RAW file: {}", source_path.display()))?;
        let original_width = image_property(&source, unsafe { kCGImagePropertyPixelWidth });
        let original_height = image_property(&source, unsafe { kCGImagePropertyPixelHeight });

        let max_pixel_size = CFNumber::new_i64(i64::from(max_dimension));
        let thumbnail_options = CFDictionary::<CFType, CFType>::from_slices(
            &[
                unsafe { kCGImageSourceCreateThumbnailFromImageAlways }.as_ref(),
                unsafe { kCGImageSourceCreateThumbnailWithTransform }.as_ref(),
                unsafe { kCGImageSourceThumbnailMaxPixelSize }.as_ref(),
            ],
            &[
                CFBoolean::new(true).as_ref(),
                CFBoolean::new(true).as_ref(),
                max_pixel_size.as_ref(),
            ],
        );
        let thumbnail_options: &CFDictionary = unsafe { thumbnail_options.cast_unchecked() };
        let preview =
            unsafe { source.thumbnail_at_index(0, Some(thumbnail_options)) }.ok_or_else(|| {
                format!(
                    "ImageIO could not render RAW file: {}",
                    source_path.display()
                )
            })?;

        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("Failed to create RAW preview directory: {}", error))?;
        }
        let temporary_path = output_path.with_extension("jpg.gala-tmp");
        if temporary_path.exists() {
            std::fs::remove_file(&temporary_path)
                .map_err(|error| format!("Failed to clear stale RAW preview: {}", error))?;
        }
        let output_url = CFURL::from_file_path(&temporary_path)
            .ok_or_else(|| format!("Invalid RAW preview path: {}", temporary_path.display()))?;
        let jpeg_type = CFString::from_str("public.jpeg");
        let destination = unsafe { CGImageDestination::with_url(&output_url, &jpeg_type, 1, None) }
            .ok_or_else(|| "ImageIO could not create the RAW preview destination".to_string())?;
        let quality = CFNumber::new_f64(0.9);
        let destination_properties = CFDictionary::<CFType, CFType>::from_slices(
            &[unsafe { kCGImageDestinationLossyCompressionQuality }.as_ref()],
            &[quality.as_ref()],
        );
        let destination_properties: &CFDictionary =
            unsafe { destination_properties.cast_unchecked() };
        unsafe {
            destination.add_image(&preview, Some(destination_properties));
        }
        if !unsafe { destination.finalize() } {
            let _ = std::fs::remove_file(&temporary_path);
            return Err("ImageIO failed to finalize the RAW preview".to_string());
        }
        std::fs::rename(&temporary_path, output_path)
            .map_err(|error| format!("Failed to publish RAW preview: {}", error))?;

        let rendered_width = u32::try_from(CGImage::width(Some(&preview))).unwrap_or(u32::MAX);
        let rendered_height = u32::try_from(CGImage::height(Some(&preview))).unwrap_or(u32::MAX);
        Ok(RawPreviewMetadata {
            original_width: original_width.unwrap_or(rendered_width),
            original_height: original_height.unwrap_or(rendered_height),
        })
    }

    fn image_property(source: &CGImageSource, key: &CFString) -> Option<u32> {
        let properties = unsafe { source.properties_at_index(0, None) }?;
        let properties: &CFDictionary<CFType, CFType> = unsafe { properties.cast_unchecked() };
        let value = properties.get(key.as_ref())?;
        let number = value.downcast::<CFNumber>().ok()?;
        u32::try_from(number.as_i64()?).ok()
    }
}
