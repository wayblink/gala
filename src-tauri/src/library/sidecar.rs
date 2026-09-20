use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub const SIDECAR_DIR_NAME: &str = ".gala";
pub const SIDECAR_SCHEMA_VERSION: u32 = 1;

pub fn volume_id(source_root: &Path) -> Option<String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        return fs::metadata(source_root)
            .ok()
            .map(|metadata| metadata.dev().to_string());
    }
    #[cfg(not(unix))]
    {
        let _ = source_root;
        None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SidecarManifest {
    pub schema_version: u32,
    pub source_root: String,
    pub source_id: String,
    pub generated_by: String,
    pub photo_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SidecarAssetRecord {
    pub id: String,
    pub relative_path: String,
    pub file_name: String,
    pub extension: String,
    pub file_size: i64,
    pub file_mtime: i64,
    pub fingerprint: String,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub captured_at: Option<String>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub gps_latitude: Option<f64>,
    pub gps_longitude: Option<f64>,
    pub favorited_at: Option<String>,
    pub hidden_at: Option<String>,
    pub thumbnail_small_path: Option<String>,
    pub thumbnail_medium_path: Option<String>,
    pub thumbnail_large_path: Option<String>,
    pub asset_status: Option<String>,
    pub generated_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SidecarStore {
    root: PathBuf,
}

impl SidecarStore {
    pub fn for_source(source_root: &Path) -> Option<Self> {
        let path = source_root.to_str()?;
        if !path.starts_with("/Volumes/") {
            return None;
        }
        Some(Self {
            root: source_root.join(SIDECAR_DIR_NAME),
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn thumbnail_dir(&self) -> PathBuf {
        self.root.join("thumbnails")
    }

    pub fn sidecar_root_string(&self) -> String {
        self.root.to_string_lossy().to_string()
    }

    pub fn prepare(&self) -> Result<(), String> {
        for directory in [
            self.thumbnail_dir(),
            self.thumbnail_dir().join("small"),
            self.thumbnail_dir().join("medium"),
            self.thumbnail_dir().join("large"),
            self.thumbnail_dir().join("raw-previews"),
        ] {
            fs::create_dir_all(&directory).map_err(|error| {
                format!(
                    "Failed to create Gala sidecar directory {}: {}",
                    directory.display(),
                    error
                )
            })?;
        }
        Ok(())
    }

    pub fn write_manifest(&self, manifest: &SidecarManifest) -> Result<(), String> {
        self.prepare()?;
        let destination = self.root.join("manifest.json");
        let temporary = self.root.join("manifest.json.tmp");
        let bytes = serde_json::to_vec_pretty(manifest)
            .map_err(|error| format!("Failed to encode Gala sidecar manifest: {}", error))?;
        fs::write(&temporary, bytes)
            .map_err(|error| format!("Failed to write Gala sidecar manifest: {}", error))?;
        fs::rename(&temporary, &destination)
            .map_err(|error| format!("Failed to commit Gala sidecar manifest: {}", error))
    }

    pub fn read_manifest(&self) -> Result<Option<SidecarManifest>, String> {
        let path = self.root.join("manifest.json");
        if !path.exists() {
            return Ok(None);
        }
        let bytes = fs::read(&path)
            .map_err(|error| format!("Failed to read Gala sidecar manifest: {}", error))?;
        let manifest: SidecarManifest = serde_json::from_slice(&bytes)
            .map_err(|error| format!("Failed to parse Gala sidecar manifest: {}", error))?;
        if manifest.schema_version != SIDECAR_SCHEMA_VERSION {
            return Err(format!(
                "Unsupported Gala sidecar schema version: {}",
                manifest.schema_version
            ));
        }
        Ok(Some(manifest))
    }

    pub fn write_asset_index(&self, records: &[SidecarAssetRecord]) -> Result<(), String> {
        self.prepare()?;
        let destination = self.root.join("asset-index.json");
        let temporary = self.root.join("asset-index.json.tmp");
        let bytes = serde_json::to_vec_pretty(records)
            .map_err(|error| format!("Failed to encode Gala sidecar asset index: {}", error))?;
        fs::write(&temporary, bytes)
            .map_err(|error| format!("Failed to write Gala sidecar asset index: {}", error))?;
        fs::rename(&temporary, &destination)
            .map_err(|error| format!("Failed to commit Gala sidecar asset index: {}", error))
    }

    pub fn read_asset_index(&self) -> Result<Vec<SidecarAssetRecord>, String> {
        let path = self.root.join("asset-index.json");
        if !path.exists() {
            return Ok(Vec::new());
        }
        let bytes = fs::read(&path)
            .map_err(|error| format!("Failed to read Gala sidecar asset index: {}", error))?;
        serde_json::from_slice(&bytes)
            .map_err(|error| format!("Failed to parse Gala sidecar asset index: {}", error))
    }

    pub fn export_source_index(&self, conn: &Connection, source_id: &str) -> Result<usize, String> {
        let mut stmt = conn
            .prepare(
                "SELECT p.id, p.relative_path, p.file_name, p.extension, p.file_size, p.file_mtime, \
                        p.fingerprint, p.width, p.height, p.captured_at, p.camera_make, p.camera_model, \
                        p.lens_model, p.gps_latitude, p.gps_longitude, p.favorited_at, p.hidden_at, \
                        pa.thumbnail_small_path, pa.thumbnail_medium_path, pa.thumbnail_large_path, \
                        pa.asset_status, pa.generated_at \
                 FROM photos p LEFT JOIN photo_assets pa ON pa.photo_id = p.id \
                 WHERE p.source_id = ?1 ORDER BY p.relative_path",
            )
            .map_err(|error| format!("Failed to prepare Gala sidecar export: {}", error))?;
        let records = stmt
            .query_map(params![source_id], |row| {
                Ok(SidecarAssetRecord {
                    id: row.get(0)?,
                    relative_path: row.get(1)?,
                    file_name: row.get(2)?,
                    extension: row.get(3)?,
                    file_size: row.get(4)?,
                    file_mtime: row.get(5)?,
                    fingerprint: row.get(6)?,
                    width: row.get(7)?,
                    height: row.get(8)?,
                    captured_at: row.get(9)?,
                    camera_make: row.get(10)?,
                    camera_model: row.get(11)?,
                    lens_model: row.get(12)?,
                    gps_latitude: row.get(13)?,
                    gps_longitude: row.get(14)?,
                    favorited_at: row.get(15)?,
                    hidden_at: row.get(16)?,
                    thumbnail_small_path: self.portable_thumbnail_path(row.get(17)?),
                    thumbnail_medium_path: self.portable_thumbnail_path(row.get(18)?),
                    thumbnail_large_path: self.portable_thumbnail_path(row.get(19)?),
                    asset_status: row.get(20)?,
                    generated_at: row.get(21)?,
                })
            })
            .map_err(|error| format!("Failed to query Gala sidecar export: {}", error))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("Failed to collect Gala sidecar export: {}", error))?;
        self.write_asset_index(&records)?;
        Ok(records.len())
    }

    pub fn restore_source_index(
        &self,
        conn: &mut Connection,
        source_id: &str,
        source_root: &Path,
    ) -> Result<usize, String> {
        let records = self.read_asset_index()?;
        if records.is_empty() {
            return Ok(0);
        }
        let tx = conn
            .transaction()
            .map_err(|error| format!("Failed to start Gala sidecar restore: {}", error))?;
        for record in &records {
            let absolute_path = source_root
                .join(&record.relative_path)
                .to_string_lossy()
                .to_string();
            tx.execute(
                "INSERT INTO photos \
                    (id, source_id, relative_path, absolute_path_snapshot, file_name, extension, \
                     file_size, file_mtime, fingerprint, width, height, captured_at, camera_make, \
                     camera_model, lens_model, gps_latitude, gps_longitude, status, favorited_at, \
                     hidden_at, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, \
                         ?16, ?17, 'indexed', ?18, ?19, datetime('now'), datetime('now')) \
                 ON CONFLICT(id) DO UPDATE SET \
                    source_id = excluded.source_id, relative_path = excluded.relative_path, \
                    absolute_path_snapshot = excluded.absolute_path_snapshot, \
                    file_name = excluded.file_name, extension = excluded.extension, \
                    file_size = excluded.file_size, file_mtime = excluded.file_mtime, \
                    fingerprint = excluded.fingerprint, \
                    width = COALESCE(photos.width, excluded.width), \
                    height = COALESCE(photos.height, excluded.height), \
                    captured_at = COALESCE(photos.captured_at, excluded.captured_at), \
                    camera_make = COALESCE(photos.camera_make, excluded.camera_make), \
                    camera_model = COALESCE(photos.camera_model, excluded.camera_model), \
                    lens_model = COALESCE(photos.lens_model, excluded.lens_model), \
                    gps_latitude = COALESCE(photos.gps_latitude, excluded.gps_latitude), \
                    gps_longitude = COALESCE(photos.gps_longitude, excluded.gps_longitude), \
                    favorited_at = COALESCE(photos.favorited_at, excluded.favorited_at), \
                    hidden_at = COALESCE(photos.hidden_at, excluded.hidden_at), \
                    updated_at = datetime('now')",
                params![
                    record.id,
                    source_id,
                    record.relative_path,
                    absolute_path,
                    record.file_name,
                    record.extension,
                    record.file_size,
                    record.file_mtime,
                    record.fingerprint,
                    record.width,
                    record.height,
                    record.captured_at,
                    record.camera_make,
                    record.camera_model,
                    record.lens_model,
                    record.gps_latitude,
                    record.gps_longitude,
                    record.favorited_at,
                    record.hidden_at,
                ],
            )
            .map_err(|error| format!("Failed to restore Gala sidecar photo: {}", error))?;

            if let Some(asset_status) = &record.asset_status {
                let small = self.resolve_thumbnail_path(record.thumbnail_small_path.as_deref());
                let medium = self.resolve_thumbnail_path(record.thumbnail_medium_path.as_deref());
                let large = self.resolve_thumbnail_path(record.thumbnail_large_path.as_deref());
                tx.execute(
                    "INSERT INTO photo_assets \
                        (photo_id, thumbnail_small_path, thumbnail_medium_path, thumbnail_large_path, asset_status, generated_at) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
                     ON CONFLICT(photo_id) DO UPDATE SET \
                        thumbnail_small_path = excluded.thumbnail_small_path, \
                        thumbnail_medium_path = excluded.thumbnail_medium_path, \
                        thumbnail_large_path = excluded.thumbnail_large_path, \
                        asset_status = excluded.asset_status, generated_at = excluded.generated_at",
                    params![record.id, small, medium, large, asset_status, record.generated_at],
                )
                .map_err(|error| format!("Failed to restore Gala sidecar thumbnails: {}", error))?;
            }
        }
        tx.commit()
            .map_err(|error| format!("Failed to commit Gala sidecar restore: {}", error))?;
        Ok(records.len())
    }

    fn portable_thumbnail_path(&self, path: Option<String>) -> Option<String> {
        path.and_then(|path| {
            Path::new(&path)
                .strip_prefix(&self.root)
                .ok()
                .map(|relative| relative.to_string_lossy().to_string())
        })
    }

    fn resolve_thumbnail_path(&self, path: Option<&str>) -> Option<String> {
        path.map(|path| self.root.join(path).to_string_lossy().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn sidecar_is_enabled_only_for_mounted_volume_paths() {
        let volume = TempDir::new().unwrap();
        let volume_path = PathBuf::from("/Volumes/TestDrive/Photos");
        assert!(SidecarStore::for_source(&volume_path).is_some());
        assert!(SidecarStore::for_source(volume.path()).is_none());
    }

    #[test]
    fn creates_thumbnail_layout_and_round_trips_manifest() {
        let temp_dir = TempDir::new().unwrap();
        let store = SidecarStore {
            root: temp_dir.path().join(SIDECAR_DIR_NAME),
        };
        store.prepare().unwrap();
        assert!(store.thumbnail_dir().join("small").is_dir());
        assert!(store.thumbnail_dir().join("raw-previews").is_dir());

        let manifest = SidecarManifest {
            schema_version: SIDECAR_SCHEMA_VERSION,
            source_root: "/Volumes/TestDrive/Photos".to_string(),
            source_id: "source-1".to_string(),
            generated_by: "gala-test".to_string(),
            photo_count: 42,
        };
        store.write_manifest(&manifest).unwrap();
        assert_eq!(store.read_manifest().unwrap(), Some(manifest));

        let record = SidecarAssetRecord {
            id: "photo-1".to_string(),
            relative_path: "2026/photo.jpg".to_string(),
            file_name: "photo.jpg".to_string(),
            extension: "jpg".to_string(),
            file_size: 12,
            file_mtime: 34,
            fingerprint: "12:34".to_string(),
            width: Some(100),
            height: Some(80),
            captured_at: None,
            camera_make: None,
            camera_model: None,
            lens_model: None,
            gps_latitude: None,
            gps_longitude: None,
            favorited_at: None,
            hidden_at: None,
            thumbnail_small_path: Some("thumbnails/small/p.jpg".to_string()),
            thumbnail_medium_path: Some("thumbnails/medium/p.jpg".to_string()),
            thumbnail_large_path: Some("thumbnails/large/p.jpg".to_string()),
            asset_status: Some("ready".to_string()),
            generated_at: Some("now".to_string()),
        };
        store
            .write_asset_index(std::slice::from_ref(&record))
            .unwrap();
        assert_eq!(store.read_asset_index().unwrap(), vec![record]);
    }

    #[test]
    fn rejects_unknown_schema_without_removing_existing_manifest() {
        let temp_dir = TempDir::new().unwrap();
        let store = SidecarStore {
            root: temp_dir.path().join(SIDECAR_DIR_NAME),
        };
        store.prepare().unwrap();
        fs::write(
            store.root().join("manifest.json"),
            r#"{"schemaVersion":999,"sourceRoot":"/Volumes/TestDrive/Photos","sourceId":"x","generatedBy":"x","photoCount":0}"#,
        )
        .unwrap();
        assert!(store.read_manifest().unwrap_err().contains("999"));
        assert!(store.root().join("manifest.json").exists());
    }
}
