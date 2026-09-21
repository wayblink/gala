//! Common contract for photo sources.
//!
//! Providers describe how assets are read and which physical operations are
//! safe. The organization controller owns identities, plans, and recovery;
//! providers only perform the requested source operation.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use super::apple_photos::{fetch_albums, fetch_assets, write_thumbnail_with_network};
use super::exif::{extract_exif_metadata, ExtractedExifMetadata as PhotoMetadata};
use super::scanner::discover_photos_with_progress;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SourceKind {
    LocalFolder,
    ApplePhotos,
}

impl SourceKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::LocalFolder => "local_folder",
            Self::ApplePhotos => "apple_photos",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProviderCapability {
    Read,
    ReadOriginal,
    Collections,
    Export,
    Copy,
    Move,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SourceDescriptor {
    pub id: String,
    pub name: String,
    pub kind: SourceKind,
    /// A folder path for local sources, or an opaque provider locator (for
    /// example an Apple Photos library identifier).
    pub locator: String,
    pub capabilities: Vec<ProviderCapability>,
}

impl SourceDescriptor {
    pub fn can(&self, capability: ProviderCapability) -> bool {
        self.capabilities.contains(&capability)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AssetDescriptor {
    pub id: String,
    pub source_id: String,
    /// Relative path for a local file, or an opaque asset identifier.
    pub locator: String,
    pub file_name: String,
    pub extension: Option<String>,
    pub fingerprint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CollectionDescriptor {
    pub id: String,
    pub source_id: String,
    pub name: String,
    pub asset_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AssetContent {
    pub bytes: Vec<u8>,
    pub mime_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PhysicalOperation {
    pub source_asset_id: String,
    pub source_locator: String,
    pub destination: PathBuf,
    pub action: ProviderAction,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProviderAction {
    Export,
    Copy,
    Move,
}

impl ProviderAction {
    pub fn required_capability(self) -> ProviderCapability {
        match self {
            Self::Export => ProviderCapability::Export,
            Self::Copy => ProviderCapability::Copy,
            Self::Move => ProviderCapability::Move,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PhysicalOperationResult {
    pub operation: PhysicalOperation,
    pub destination: PathBuf,
    pub created: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ProviderError {
    Unsupported { capability: ProviderCapability },
    SourceUnavailable(String),
    AssetUnavailable(String),
    Conflict(String),
    Io(String),
    Other(String),
}

impl std::fmt::Display for ProviderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unsupported { capability } => {
                write!(f, "provider does not support {:?}", capability)
            }
            Self::SourceUnavailable(message) => write!(f, "source unavailable: {message}"),
            Self::AssetUnavailable(message) => write!(f, "asset unavailable: {message}"),
            Self::Conflict(message) => write!(f, "operation conflict: {message}"),
            Self::Io(message) => write!(f, "provider I/O error: {message}"),
            Self::Other(message) => f.write_str(message),
        }
    }
}

impl std::error::Error for ProviderError {}

/// Provider boundary used by browsing and organization controllers.
///
/// Implementations should keep source-specific identifiers opaque to callers.
/// The controller persists stable photo IDs and location history separately.
#[async_trait]
pub trait SourceProvider: Send + Sync {
    fn describe(&self) -> SourceDescriptor;

    async fn enumerate_assets(
        &self,
        scope: Option<&Path>,
    ) -> Result<Vec<AssetDescriptor>, ProviderError>;
    async fn read_metadata(&self, asset: &AssetDescriptor) -> Result<PhotoMetadata, ProviderError>;
    async fn read_preview(
        &self,
        asset: &AssetDescriptor,
        size: u32,
    ) -> Result<AssetContent, ProviderError>;
    async fn read_original(&self, asset: &AssetDescriptor) -> Result<AssetContent, ProviderError>;
    async fn list_collections(&self) -> Result<Vec<CollectionDescriptor>, ProviderError>;

    async fn export(
        &self,
        asset: &AssetDescriptor,
        destination: &Path,
    ) -> Result<PhysicalOperationResult, ProviderError> {
        let _ = (asset, destination);
        Err(ProviderError::Unsupported {
            capability: ProviderCapability::Export,
        })
    }

    async fn copy(
        &self,
        asset: &AssetDescriptor,
        destination: &Path,
    ) -> Result<PhysicalOperationResult, ProviderError> {
        let _ = (asset, destination);
        Err(ProviderError::Unsupported {
            capability: ProviderCapability::Copy,
        })
    }

    async fn move_asset(
        &self,
        asset: &AssetDescriptor,
        destination: &Path,
    ) -> Result<PhysicalOperationResult, ProviderError> {
        let _ = (asset, destination);
        Err(ProviderError::Unsupported {
            capability: ProviderCapability::Move,
        })
    }
}

pub struct LocalFolderProvider {
    descriptor: SourceDescriptor,
}

impl LocalFolderProvider {
    pub fn new(descriptor: SourceDescriptor) -> Result<Self, ProviderError> {
        if descriptor.kind != SourceKind::LocalFolder {
            return Err(ProviderError::Other(
                "expected local_folder source".to_string(),
            ));
        }
        Ok(Self { descriptor })
    }

    fn path_for(&self, asset: &AssetDescriptor) -> PathBuf {
        Path::new(&self.descriptor.locator).join(&asset.locator)
    }

    fn result(
        &self,
        asset: &AssetDescriptor,
        destination: &Path,
        action: ProviderAction,
    ) -> PhysicalOperationResult {
        PhysicalOperationResult {
            operation: PhysicalOperation {
                source_asset_id: asset.id.clone(),
                source_locator: asset.locator.clone(),
                destination: destination.to_path_buf(),
                action,
            },
            destination: destination.to_path_buf(),
            created: true,
        }
    }
}

#[async_trait]
impl SourceProvider for LocalFolderProvider {
    fn describe(&self) -> SourceDescriptor {
        self.descriptor.clone()
    }

    async fn enumerate_assets(
        &self,
        scope: Option<&Path>,
    ) -> Result<Vec<AssetDescriptor>, ProviderError> {
        let root = scope.unwrap_or_else(|| Path::new(&self.descriptor.locator));
        let discovered = discover_photos_with_progress(root, |_, _| {})
            .map_err(ProviderError::SourceUnavailable)?;
        Ok(discovered
            .into_iter()
            .filter_map(|photo| {
                let locator = photo
                    .absolute_path
                    .strip_prefix(&self.descriptor.locator)
                    .ok()?
                    .to_string_lossy()
                    .replace('\\', "/");
                Some(AssetDescriptor {
                    id: format!("{}:{}", self.descriptor.id, locator),
                    source_id: self.descriptor.id.clone(),
                    locator,
                    file_name: photo.file_name,
                    extension: Some(photo.extension),
                    fingerprint: Some(format!("{}:{}", photo.file_size, photo.file_mtime)),
                })
            })
            .collect())
    }

    async fn read_metadata(&self, asset: &AssetDescriptor) -> Result<PhotoMetadata, ProviderError> {
        extract_exif_metadata(&self.path_for(asset)).map_err(ProviderError::AssetUnavailable)
    }

    async fn read_preview(
        &self,
        asset: &AssetDescriptor,
        _size: u32,
    ) -> Result<AssetContent, ProviderError> {
        self.read_original(asset).await
    }

    async fn read_original(&self, asset: &AssetDescriptor) -> Result<AssetContent, ProviderError> {
        let bytes = fs::read(self.path_for(asset))
            .map_err(|error| ProviderError::AssetUnavailable(error.to_string()))?;
        Ok(AssetContent {
            bytes,
            mime_type: None,
        })
    }

    async fn list_collections(&self) -> Result<Vec<CollectionDescriptor>, ProviderError> {
        let mut result = Vec::new();
        for entry in fs::read_dir(&self.descriptor.locator)
            .map_err(|error| ProviderError::SourceUnavailable(error.to_string()))?
        {
            let entry =
                entry.map_err(|error| ProviderError::SourceUnavailable(error.to_string()))?;
            if entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
                result.push(CollectionDescriptor {
                    id: entry.path().to_string_lossy().to_string(),
                    source_id: self.descriptor.id.clone(),
                    name: entry.file_name().to_string_lossy().to_string(),
                    asset_count: 0,
                });
            }
        }
        Ok(result)
    }

    async fn export(
        &self,
        asset: &AssetDescriptor,
        destination: &Path,
    ) -> Result<PhysicalOperationResult, ProviderError> {
        self.copy(asset, destination).await
    }

    async fn copy(
        &self,
        asset: &AssetDescriptor,
        destination: &Path,
    ) -> Result<PhysicalOperationResult, ProviderError> {
        if destination.exists() {
            return Err(ProviderError::Conflict(destination.display().to_string()));
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| ProviderError::Io(error.to_string()))?;
        }
        fs::copy(self.path_for(asset), destination)
            .map_err(|error| ProviderError::Io(error.to_string()))?;
        Ok(self.result(asset, destination, ProviderAction::Copy))
    }

    async fn move_asset(
        &self,
        asset: &AssetDescriptor,
        destination: &Path,
    ) -> Result<PhysicalOperationResult, ProviderError> {
        if destination.exists() {
            return Err(ProviderError::Conflict(destination.display().to_string()));
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| ProviderError::Io(error.to_string()))?;
        }
        fs::rename(self.path_for(asset), destination)
            .map_err(|error| ProviderError::Io(error.to_string()))?;
        Ok(self.result(asset, destination, ProviderAction::Move))
    }
}

pub struct ApplePhotosProvider {
    descriptor: SourceDescriptor,
}

impl ApplePhotosProvider {
    pub fn new(descriptor: SourceDescriptor) -> Result<Self, ProviderError> {
        if descriptor.kind != SourceKind::ApplePhotos {
            return Err(ProviderError::Other(
                "expected apple_photos source".to_string(),
            ));
        }
        Ok(Self { descriptor })
    }

    fn asset_id(asset: &AssetDescriptor) -> &str {
        asset
            .locator
            .strip_prefix("apple-photos:")
            .unwrap_or(&asset.locator)
    }

    fn temp_path(asset: &AssetDescriptor, suffix: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "gala-apple-{}-{}.{}",
            uuid::Uuid::new_v4(),
            asset.id.replace(':', "_"),
            suffix
        ))
    }
}

#[async_trait]
impl SourceProvider for ApplePhotosProvider {
    fn describe(&self) -> SourceDescriptor {
        self.descriptor.clone()
    }

    async fn enumerate_assets(
        &self,
        _scope: Option<&Path>,
    ) -> Result<Vec<AssetDescriptor>, ProviderError> {
        Ok(fetch_assets()
            .into_iter()
            .map(|asset| AssetDescriptor {
                id: format!("apple-photos:{}", asset.local_identifier),
                source_id: self.descriptor.id.clone(),
                locator: format!("apple-photos:{}", asset.local_identifier),
                file_name: asset.file_name,
                extension: None,
                fingerprint: asset.captured_at,
            })
            .collect())
    }

    async fn read_metadata(&self, asset: &AssetDescriptor) -> Result<PhotoMetadata, ProviderError> {
        let known = fetch_assets()
            .into_iter()
            .find(|item| item.local_identifier == Self::asset_id(asset));
        Ok(PhotoMetadata {
            captured_at: known.and_then(|item| item.captured_at),
            ..PhotoMetadata::default()
        })
    }

    async fn read_preview(
        &self,
        asset: &AssetDescriptor,
        size: u32,
    ) -> Result<AssetContent, ProviderError> {
        let path = Self::temp_path(asset, "jpg");
        write_thumbnail_with_network(Self::asset_id(asset), &path, size as f64, true)
            .map_err(ProviderError::AssetUnavailable)?;
        let bytes =
            fs::read(&path).map_err(|error| ProviderError::AssetUnavailable(error.to_string()))?;
        let _ = fs::remove_file(path);
        Ok(AssetContent {
            bytes,
            mime_type: Some("image/jpeg".to_string()),
        })
    }

    async fn read_original(&self, asset: &AssetDescriptor) -> Result<AssetContent, ProviderError> {
        let path = Self::temp_path(asset, "original");
        super::apple_photos::write_original(Self::asset_id(asset), &path)
            .map_err(ProviderError::AssetUnavailable)?;
        let bytes =
            fs::read(&path).map_err(|error| ProviderError::AssetUnavailable(error.to_string()))?;
        let _ = fs::remove_file(path);
        Ok(AssetContent {
            bytes,
            mime_type: None,
        })
    }

    async fn list_collections(&self) -> Result<Vec<CollectionDescriptor>, ProviderError> {
        Ok(fetch_albums()
            .into_iter()
            .map(|album| CollectionDescriptor {
                id: album.local_identifier,
                source_id: self.descriptor.id.clone(),
                name: album.title,
                asset_count: album.asset_local_identifiers.len(),
            })
            .collect())
    }

    async fn export(
        &self,
        asset: &AssetDescriptor,
        destination: &Path,
    ) -> Result<PhysicalOperationResult, ProviderError> {
        if destination.exists() {
            return Err(ProviderError::Conflict(destination.display().to_string()));
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| ProviderError::Io(error.to_string()))?;
        }
        super::apple_photos::write_original(Self::asset_id(asset), destination)
            .map_err(ProviderError::AssetUnavailable)?;
        Ok(PhysicalOperationResult {
            operation: PhysicalOperation {
                source_asset_id: asset.id.clone(),
                source_locator: asset.locator.clone(),
                destination: destination.to_path_buf(),
                action: ProviderAction::Export,
            },
            destination: destination.to_path_buf(),
            created: true,
        })
    }
}

pub fn local_folder_descriptor(
    id: impl Into<String>,
    name: impl Into<String>,
    root: impl Into<String>,
) -> SourceDescriptor {
    SourceDescriptor {
        id: id.into(),
        name: name.into(),
        kind: SourceKind::LocalFolder,
        locator: root.into(),
        capabilities: vec![
            ProviderCapability::Read,
            ProviderCapability::ReadOriginal,
            ProviderCapability::Collections,
            ProviderCapability::Export,
            ProviderCapability::Copy,
            ProviderCapability::Move,
        ],
    }
}

pub fn apple_photos_descriptor(
    id: impl Into<String>,
    name: impl Into<String>,
    library_id: impl Into<String>,
) -> SourceDescriptor {
    SourceDescriptor {
        id: id.into(),
        name: name.into(),
        kind: SourceKind::ApplePhotos,
        locator: library_id.into(),
        capabilities: vec![
            ProviderCapability::Read,
            ProviderCapability::ReadOriginal,
            ProviderCapability::Collections,
            ProviderCapability::Export,
        ],
    }
}

/// Build a descriptor from the persisted `sources.source_type` value.
///
/// This is intentionally a small compatibility seam: existing scan and
/// Photos commands keep their current implementations while planning code can
/// use one capability-aware boundary. Unknown source kinds fail closed rather
/// than inheriting local-folder move semantics.
pub fn descriptor_for_source(
    source_id: impl Into<String>,
    name: impl Into<String>,
    source_kind: &str,
    locator: impl Into<String>,
) -> Result<SourceDescriptor, ProviderError> {
    let source_id = source_id.into();
    let name = name.into();
    let locator = locator.into();
    match source_kind {
        "local_folder" => Ok(local_folder_descriptor(source_id, name, locator)),
        "apple_photos" => Ok(apple_photos_descriptor(source_id, name, locator)),
        other => Err(ProviderError::SourceUnavailable(format!(
            "unsupported source kind: {other}"
        ))),
    }
}

/// Validate a planned physical action before an adapter is invoked.
pub fn ensure_action_supported(
    source: &SourceDescriptor,
    action: ProviderAction,
) -> Result<(), ProviderError> {
    let capability = action.required_capability();
    if source.can(capability) {
        Ok(())
    } else {
        Err(ProviderError::Unsupported { capability })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_folder_supports_physical_operations() {
        let source = local_folder_descriptor("local", "Pictures", "/pictures");
        assert!(source.can(ProviderCapability::Move));
        assert!(source.can(ProviderCapability::Copy));
        assert!(source.can(ProviderCapability::Export));
    }

    #[test]
    fn apple_photos_is_export_only() {
        let source = apple_photos_descriptor("photos", "Apple Photos", "library-1");
        assert!(source.can(ProviderCapability::ReadOriginal));
        assert!(source.can(ProviderCapability::Export));
        assert!(!source.can(ProviderCapability::Move));
        assert!(!source.can(ProviderCapability::Copy));
    }

    #[test]
    fn persisted_source_kind_maps_to_safe_capabilities() {
        let source = descriptor_for_source("photos", "Photos", "apple_photos", "library")
            .expect("known source kind");
        assert_eq!(source.kind.as_str(), "apple_photos");
        assert!(ensure_action_supported(&source, ProviderAction::Export).is_ok());
        assert!(matches!(
            ensure_action_supported(&source, ProviderAction::Move),
            Err(ProviderError::Unsupported {
                capability: ProviderCapability::Move
            })
        ));
    }

    #[test]
    fn unknown_source_kind_fails_closed() {
        let result = descriptor_for_source("future", "Future", "remote", "opaque");
        assert!(matches!(result, Err(ProviderError::SourceUnavailable(_))));
    }

    #[test]
    fn unsupported_physical_action_is_explicit() {
        let source = apple_photos_descriptor("photos", "Apple Photos", "library");
        let error = ensure_action_supported(&source, ProviderAction::Move).unwrap_err();
        assert!(matches!(
            error,
            ProviderError::Unsupported {
                capability: ProviderCapability::Move
            }
        ));
    }
}
