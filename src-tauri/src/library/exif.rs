use chrono::NaiveDateTime;
use exif::{Field, Reader, Tag, Value};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;

#[derive(Debug, Default, Clone)]
pub struct ExtractedExifMetadata {
    pub captured_at: Option<String>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub gps_latitude: Option<f64>,
    pub gps_longitude: Option<f64>,
}

pub fn extract_exif_metadata(path: &Path) -> Result<ExtractedExifMetadata, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open photo for EXIF: {}", e))?;
    let mut reader = BufReader::new(file);
    let exif = Reader::new()
        .read_from_container(&mut reader)
        .map_err(|e| format!("Failed to read EXIF: {}", e))?;

    Ok(ExtractedExifMetadata {
        captured_at: string_field(&exif, Tag::DateTimeOriginal)
            .or_else(|| string_field(&exif, Tag::DateTime))
            .and_then(|value| parse_exif_datetime(&value)),
        camera_make: string_field(&exif, Tag::Make),
        camera_model: string_field(&exif, Tag::Model),
        lens_model: string_field(&exif, Tag::LensModel),
        gps_latitude: gps_coordinate(&exif, Tag::GPSLatitude, Tag::GPSLatitudeRef),
        gps_longitude: gps_coordinate(&exif, Tag::GPSLongitude, Tag::GPSLongitudeRef),
    })
}

fn string_field(exif: &exif::Exif, tag: Tag) -> Option<String> {
    let field = field_by_tag(exif, tag)?;

    match &field.value {
        Value::Ascii(values) => values
            .first()
            .map(|value| {
                String::from_utf8_lossy(value)
                    .trim_matches('\0')
                    .trim()
                    .to_string()
            })
            .filter(|value| !value.is_empty()),
        _ => {
            let value = field.display_value().with_unit(exif).to_string();
            if value.trim().is_empty() {
                None
            } else {
                Some(value)
            }
        }
    }
}

fn parse_exif_datetime(value: &str) -> Option<String> {
    NaiveDateTime::parse_from_str(value.trim(), "%Y:%m:%d %H:%M:%S")
        .ok()
        .map(|datetime| datetime.and_utc().to_rfc3339())
}

fn gps_coordinate(exif: &exif::Exif, value_tag: Tag, ref_tag: Tag) -> Option<f64> {
    let field = field_by_tag(exif, value_tag)?;
    let values = match &field.value {
        Value::Rational(values) if values.len() >= 3 => values,
        _ => return None,
    };

    let mut coordinate =
        values[0].to_f64() + (values[1].to_f64() / 60.0) + (values[2].to_f64() / 3600.0);
    let reference = string_field(exif, ref_tag).unwrap_or_default();
    if matches!(reference.trim(), "S" | "W") {
        coordinate = -coordinate;
    }

    Some(coordinate)
}

fn field_by_tag(exif: &exif::Exif, tag: Tag) -> Option<&Field> {
    exif.fields().find(|field| field.tag == tag)
}
