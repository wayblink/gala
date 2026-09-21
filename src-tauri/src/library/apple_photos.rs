//! Read-only Apple Photos / PhotoKit integration for macOS.
//! The first phase imports asset metadata into Gala's own index; it never edits
//! or deletes anything in the system Photos library.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplePhotosStatus {
    pub available: bool,
    pub authorization: String,
    pub asset_count: i64,
    pub source_id: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ApplePhotoAsset {
    pub local_identifier: String,
    pub file_name: String,
    pub captured_at: Option<String>,
    pub width: i64,
    pub height: i64,
    pub is_favorite: bool,
    pub is_hidden: bool,
}

#[derive(Debug, Clone)]
pub struct ApplePhotoAlbum {
    pub local_identifier: String,
    pub title: String,
    pub asset_local_identifiers: Vec<String>,
}

#[cfg(target_os = "macos")]
mod platform {
    use super::{ApplePhotoAsset, ApplePhotosStatus};
    use block2::RcBlock;
    use image::ImageFormat;
    use objc2::rc::Retained;
    use objc2_app_kit::NSImage;
    use objc2_foundation::{NSArray, NSData, NSDate, NSDictionary, NSString};
    use objc2_photos::{
        PHAccessLevel, PHAsset, PHAssetCollection, PHAssetCollectionSubtype, PHAssetCollectionType,
        PHAssetMediaType, PHAssetResource, PHFetchOptions, PHImageContentMode, PHImageManager,
        PHImageRequestOptions, PHImageRequestOptionsDeliveryMode, PHImageRequestOptionsResizeMode,
        PHImageRequestOptionsVersion, PHPhotoLibrary,
    };
    use std::io::Cursor;
    use std::path::Path;
    use std::sync::mpsc;

    pub fn status() -> ApplePhotosStatus {
        let library = unsafe { PHPhotoLibrary::sharedPhotoLibrary() };
        let authorization =
            unsafe { PHPhotoLibrary::authorizationStatusForAccessLevel(PHAccessLevel::ReadWrite) };
        let authorization_name = authorization_name(authorization.0);
        let asset_count = if matches!(authorization.0, 3 | 4) {
            unsafe {
                PHAsset::fetchAssetsWithMediaType_options(PHAssetMediaType::Image, None).count()
                    as i64
            }
        } else {
            0
        };
        let _ = library;
        ApplePhotosStatus {
            available: true,
            authorization: authorization_name.to_string(),
            asset_count,
            source_id: None,
            message: None,
        }
    }

    pub fn request_access_and_fetch() -> Result<Vec<ApplePhotoAsset>, String> {
        let current =
            unsafe { PHPhotoLibrary::authorizationStatusForAccessLevel(PHAccessLevel::ReadWrite) };
        if current.0 == 0 {
            let (sender, receiver) = mpsc::channel();
            let block = RcBlock::new(move |value: objc2_photos::PHAuthorizationStatus| {
                let _ = sender.send(value.0);
            });
            unsafe {
                PHPhotoLibrary::requestAuthorizationForAccessLevel_handler(
                    PHAccessLevel::ReadWrite,
                    &block,
                );
            }
            let result = receiver
                .recv()
                .map_err(|error| format!("Photos authorization callback failed: {}", error))?;
            if result != 3 && result != 4 {
                return Err(format!(
                    "Photos access was not granted: {}",
                    authorization_name(result)
                ));
            }
        } else if current.0 != 3 && current.0 != 4 {
            return Err(format!(
                "Photos access is {}",
                authorization_name(current.0)
            ));
        }
        Ok(fetch_assets())
    }

    pub fn fetch_albums() -> Vec<super::ApplePhotoAlbum> {
        let result = unsafe {
            PHAssetCollection::fetchAssetCollectionsWithType_subtype_options(
                PHAssetCollectionType::Album,
                PHAssetCollectionSubtype::AlbumRegular,
                None,
            )
        };
        let mut albums = Vec::new();
        let count = unsafe { result.count() };
        for index in 0..count {
            let collection: Retained<PHAssetCollection> = unsafe { result.objectAtIndex(index) };
            let Some(title) = (unsafe { collection.localizedTitle() }) else {
                continue;
            };
            let assets =
                unsafe { PHAsset::fetchAssetsInAssetCollection_options(&collection, None) };
            let asset_count = unsafe { assets.count() };
            let mut identifiers = Vec::new();
            for asset_index in 0..asset_count {
                let asset: Retained<PHAsset> = unsafe { assets.objectAtIndex(asset_index) };
                if unsafe { asset.mediaType() } == PHAssetMediaType::Image {
                    identifiers.push(unsafe { asset.localIdentifier() }.to_string());
                }
            }
            albums.push(super::ApplePhotoAlbum {
                local_identifier: unsafe { collection.localIdentifier() }.to_string(),
                title: title.to_string(),
                asset_local_identifiers: identifiers,
            });
        }
        albums
    }

    pub fn write_thumbnail(
        local_identifier: &str,
        destination: &Path,
        edge: f64,
    ) -> Result<(), String> {
        write_thumbnail_with_network(local_identifier, destination, edge, false)
    }

    pub fn write_thumbnail_with_network(
        local_identifier: &str,
        destination: &Path,
        edge: f64,
        network_access_allowed: bool,
    ) -> Result<(), String> {
        let identifier = NSString::from_str(local_identifier);
        let identifiers = NSArray::from_retained_slice(&[identifier]);
        let assets =
            unsafe { PHAsset::fetchAssetsWithLocalIdentifiers_options(&identifiers, None) };
        let asset =
            unsafe { assets.firstObject() }.ok_or_else(|| "Photos asset not found".to_string())?;
        let options = unsafe { PHImageRequestOptions::new() };
        unsafe {
            options.setSynchronous(true);
            options.setNetworkAccessAllowed(network_access_allowed);
            options.setDeliveryMode(PHImageRequestOptionsDeliveryMode::FastFormat);
            options.setResizeMode(PHImageRequestOptionsResizeMode::Exact);
        }
        let manager = unsafe { PHImageManager::defaultManager() };
        let output = std::sync::Arc::new(std::sync::Mutex::new(None::<Vec<u8>>));
        let block_output = output.clone();
        let block = RcBlock::new(move |image: *mut NSImage, _info| {
            if image.is_null() {
                return;
            }
            let image = unsafe { &*image };
            if let Some(data) = image.TIFFRepresentation() {
                let bytes = unsafe { data.as_bytes_unchecked() }.to_vec();
                *block_output.lock().expect("thumbnail mutex") = Some(bytes);
            }
        });
        unsafe {
            manager.requestImageForAsset_targetSize_contentMode_options_resultHandler(
                &asset,
                objc2_foundation::NSSize::new(edge, edge),
                PHImageContentMode::AspectFill,
                Some(&options),
                &block,
            );
        }
        let bytes = output
            .lock()
            .map_err(|_| "Thumbnail result lock failed".to_string())?
            .clone()
            .ok_or_else(|| {
                "Asset thumbnail is only in iCloud or unavailable locally".to_string()
            })?;
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let image = image::load_from_memory(&bytes)
            .map_err(|e| format!("Failed to decode Photos thumbnail: {}", e))?;
        let mut encoded = Cursor::new(Vec::new());
        image
            .write_to(&mut encoded, ImageFormat::Jpeg)
            .map_err(|e| format!("Failed to encode Photos thumbnail: {}", e))?;
        std::fs::write(destination, encoded.into_inner())
            .map_err(|e| format!("Failed to write Photos thumbnail: {}", e))
    }

    pub fn write_original(local_identifier: &str, destination: &Path) -> Result<(), String> {
        let identifier = NSString::from_str(local_identifier);
        let identifiers = NSArray::from_retained_slice(&[identifier]);
        let assets =
            unsafe { PHAsset::fetchAssetsWithLocalIdentifiers_options(&identifiers, None) };
        let asset =
            unsafe { assets.firstObject() }.ok_or_else(|| "Photos asset not found".to_string())?;
        let options = unsafe { PHImageRequestOptions::new() };
        unsafe {
            options.setSynchronous(true);
            options.setNetworkAccessAllowed(true);
            options.setVersion(PHImageRequestOptionsVersion::Original);
        }
        let manager = unsafe { PHImageManager::defaultManager() };
        let output = std::sync::Arc::new(std::sync::Mutex::new(None::<Vec<u8>>));
        let block_output = output.clone();
        let block = RcBlock::new(
            move |data: *mut NSData,
                  _uti: *mut NSString,
                  _orientation,
                  _info: *mut NSDictionary| {
                if data.is_null() {
                    return;
                }
                let bytes = unsafe { (&*data).as_bytes_unchecked() }.to_vec();
                *block_output.lock().expect("original mutex") = Some(bytes);
            },
        );
        unsafe {
            manager.requestImageDataAndOrientationForAsset_options_resultHandler(
                &asset,
                Some(&options),
                &block,
            );
        }
        let bytes = output
            .lock()
            .map_err(|_| "Original result lock failed".to_string())?
            .clone()
            .ok_or_else(|| "Original image data is unavailable from iCloud".to_string())?;
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        std::fs::write(destination, bytes)
            .map_err(|error| format!("Failed to write original image: {}", error))
    }

    pub fn fetch_assets() -> Vec<ApplePhotoAsset> {
        let options = unsafe { PHFetchOptions::new() };
        let result = unsafe {
            PHAsset::fetchAssetsWithMediaType_options(PHAssetMediaType::Image, Some(&options))
        };
        let count = unsafe { result.count() };
        let mut assets = Vec::with_capacity(count as usize);
        for index in 0..count {
            let asset: Retained<PHAsset> = unsafe { result.objectAtIndex(index) };
            let identifier = unsafe { asset.localIdentifier() }.to_string();
            let captured_at = unsafe { asset.creationDate() }.map(format_date);
            let resources = unsafe { PHAssetResource::assetResourcesForAsset(&asset) };
            let file_name = if resources.is_empty() {
                format!("Photos asset {}", index + 1)
            } else {
                let resource = resources.objectAtIndex(0);
                unsafe { resource.originalFilename() }.to_string()
            };
            assets.push(ApplePhotoAsset {
                local_identifier: identifier,
                file_name,
                captured_at,
                width: unsafe { asset.pixelWidth() } as i64,
                height: unsafe { asset.pixelHeight() } as i64,
                is_favorite: unsafe { asset.isFavorite() },
                is_hidden: false,
            });
        }
        assets
    }

    fn format_date(date: Retained<NSDate>) -> String {
        let seconds = date.timeIntervalSince1970();
        chrono::DateTime::from_timestamp(seconds as i64, 0)
            .map(|value| value.to_rfc3339())
            .unwrap_or_default()
    }

    fn authorization_name(value: isize) -> &'static str {
        match value {
            0 => "notDetermined",
            1 => "restricted",
            2 => "denied",
            3 => "authorized",
            4 => "limited",
            _ => "unknown",
        }
    }
}

#[cfg(target_os = "macos")]
pub use platform::{
    fetch_albums, fetch_assets, request_access_and_fetch, status, write_original, write_thumbnail,
    write_thumbnail_with_network,
};

#[cfg(not(target_os = "macos"))]
pub fn status() -> ApplePhotosStatus {
    ApplePhotosStatus {
        available: false,
        authorization: "unsupported".to_string(),
        asset_count: 0,
        source_id: None,
        message: Some("Apple Photos is available on macOS only.".to_string()),
    }
}

#[cfg(not(target_os = "macos"))]
pub fn fetch_albums() -> Vec<ApplePhotoAlbum> {
    Vec::new()
}

#[cfg(not(target_os = "macos"))]
pub fn fetch_assets() -> Vec<ApplePhotoAsset> {
    Vec::new()
}

#[cfg(not(target_os = "macos"))]
pub fn request_access_and_fetch() -> Result<Vec<ApplePhotoAsset>, String> {
    Err("Apple Photos integration is available on macOS only.".to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn write_thumbnail(
    _local_identifier: &str,
    _destination: &std::path::Path,
    _edge: f64,
) -> Result<(), String> {
    Err("Apple Photos integration is available on macOS only.".to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn write_thumbnail_with_network(
    _local_identifier: &str,
    _destination: &std::path::Path,
    _edge: f64,
    _network_access_allowed: bool,
) -> Result<(), String> {
    Err("Apple Photos integration is available on macOS only.".to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn write_original(
    _local_identifier: &str,
    _destination: &std::path::Path,
) -> Result<(), String> {
    Err("Apple Photos integration is available on macOS only.".to_string())
}
