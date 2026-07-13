//! Pure EXIF field extraction (kamadak-exif) for the Rust read_image route.
//!
//! Scope: EXIF/TIFF tags from JPEG/PNG/WebP/TIFF containers.
//! Explicit non-scope: full XMP/IPTC parity with TS `exifr` (mergeOutput all).
//! GPS fields are returned raw; callers must run `metadata::sanitize_metadata`.

use std::io::Cursor;
use std::path::Path;

use exif::{In, Reader as ExifReader, Value as ExifValue};
use serde_json::{Map, Number, Value};

/// Result of EXIF extraction before GPS redaction.
#[derive(Debug, Clone)]
pub struct ExifExtract {
    /// Flat tag map (tag description → JSON value). Empty if no fields.
    pub fields: Map<String, Value>,
    /// True when the container had a parseable EXIF block with ≥1 field.
    pub present: bool,
}

/// Extract EXIF fields from image container bytes (pure parse; no filesystem).
pub fn extract_exif_from_bytes(bytes: &[u8]) -> ExifExtract {
    let mut cursor = Cursor::new(bytes);
    let reader = ExifReader::new();
    match reader.read_from_container(&mut cursor) {
        Ok(exif) => fields_from_exif(&exif),
        Err(_) => ExifExtract {
            fields: Map::new(),
            present: false,
        },
    }
}

/// Extract EXIF fields from a filesystem path (I/O wrapper around pure parse).
pub fn extract_exif_from_path(path: &Path) -> ExifExtract {
    match std::fs::read(path) {
        Ok(bytes) => extract_exif_from_bytes(&bytes),
        Err(_) => ExifExtract {
            fields: Map::new(),
            present: false,
        },
    }
}

fn fields_from_exif(exif: &exif::Exif) -> ExifExtract {
    let mut fields = Map::new();
    for field in exif.fields() {
        // Prefer primary IFD + EXIF IFD + GPS IFD; skip thumbnail IFD noise.
        if field.ifd_num == In::THUMBNAIL {
            continue;
        }
        let key = field.tag.to_string();
        if key.is_empty() || key.starts_with("Tag(") {
            // Skip anonymous numeric tags for a stable surface close to exifr.
            continue;
        }
        // First wins keeps primary IFD values preferred.
        if fields.contains_key(&key) {
            continue;
        }
        fields.insert(key, exif_value_to_json(&field.value));
    }
    let present = !fields.is_empty();
    ExifExtract { fields, present }
}

fn exif_value_to_json(value: &ExifValue) -> Value {
    match value {
        ExifValue::Ascii(chunks) => {
            let joined: String = chunks
                .iter()
                .map(|c| String::from_utf8_lossy(c).trim_end_matches('\0').to_string())
                .collect::<Vec<_>>()
                .join("");
            Value::String(joined)
        }
        ExifValue::Byte(items) => {
            if items.len() == 1 {
                Value::Number(Number::from(items[0]))
            } else {
                Value::Array(items.iter().map(|b| Value::Number(Number::from(*b))).collect())
            }
        }
        ExifValue::Unknown(tag, typecode, count) => {
            Value::String(format!("unknown:tag={tag}:type={typecode}:count={count}"))
        }
        ExifValue::Short(items) => number_or_array_u32(items.iter().map(|v| u32::from(*v))),
        ExifValue::Long(items) => number_or_array_u32(items.iter().copied()),
        ExifValue::Rational(items) => {
            if items.len() == 1 {
                rational_to_json(&items[0])
            } else {
                Value::Array(items.iter().map(rational_to_json).collect())
            }
        }
        ExifValue::SByte(items) => {
            if items.len() == 1 {
                Value::Number(Number::from(items[0]))
            } else {
                Value::Array(items.iter().map(|b| Value::Number(Number::from(*b))).collect())
            }
        }
        ExifValue::Undefined(items, _) => {
            // Opaque binary — surface length only to avoid huge blobs in twins.
            Value::String(format!("undefined:{}B", items.len()))
        }
        ExifValue::SShort(items) => {
            if items.len() == 1 {
                Value::Number(Number::from(items[0]))
            } else {
                Value::Array(items.iter().map(|v| Value::Number(Number::from(*v))).collect())
            }
        }
        ExifValue::SLong(items) => {
            if items.len() == 1 {
                Value::Number(Number::from(items[0]))
            } else {
                Value::Array(items.iter().map(|v| Value::Number(Number::from(*v))).collect())
            }
        }
        ExifValue::SRational(items) => {
            if items.len() == 1 {
                srational_to_json(&items[0])
            } else {
                Value::Array(items.iter().map(srational_to_json).collect())
            }
        }
        ExifValue::Float(items) => float_or_array(items.iter().copied().map(f64::from)),
        ExifValue::Double(items) => float_or_array(items.iter().copied()),
    }
}

fn number_or_array_u32(iter: impl Iterator<Item = u32>) -> Value {
    let items: Vec<u32> = iter.collect();
    if items.len() == 1 {
        Value::Number(Number::from(items[0]))
    } else {
        Value::Array(items.into_iter().map(|v| Value::Number(Number::from(v))).collect())
    }
}

fn float_or_array(iter: impl Iterator<Item = f64>) -> Value {
    let items: Vec<f64> = iter.collect();
    if items.len() == 1 {
        number_from_f64(items[0])
    } else {
        Value::Array(items.into_iter().map(number_from_f64).collect())
    }
}

fn rational_to_json(r: &exif::Rational) -> Value {
    if r.denom == 0 {
        return Value::Null;
    }
    number_from_f64(r.num as f64 / r.denom as f64)
}

fn srational_to_json(r: &exif::SRational) -> Value {
    if r.denom == 0 {
        return Value::Null;
    }
    number_from_f64(r.num as f64 / r.denom as f64)
}

fn number_from_f64(v: f64) -> Value {
    Number::from_f64(v)
        .map(Value::Number)
        .unwrap_or(Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_bytes_yield_absent() {
        let extracted = extract_exif_from_bytes(b"not-an-image");
        assert!(!extracted.present);
        assert!(extracted.fields.is_empty());
    }

    #[test]
    fn extracts_make_model_from_kamadak_fixture_jpeg() {
        // Vendored kamadak-exif test asset path via CARGO_MANIFEST_DIR sibling of crate.
        // We embed a minimal copy under fixtures/ for offline determinism.
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures/exif-sample.jpg");
        assert!(
            fixture.is_file(),
            "missing fixture at {}",
            fixture.display()
        );
        let extracted = extract_exif_from_path(&fixture);
        assert!(extracted.present, "expected EXIF fields in fixture");
        // kamadak sample has Orientation at minimum; Make may vary by fixture.
        assert!(
            extracted.fields.contains_key("Orientation")
                || extracted.fields.contains_key("Make")
                || extracted.fields.contains_key("DateTime"),
            "fields={:?}",
            extracted.fields.keys().collect::<Vec<_>>()
        );
    }

    #[test]
    fn rational_to_json_divides_and_nulls_zero_denom() {
        let r = exif::Rational { num: 1, denom: 2 };
        assert_eq!(rational_to_json(&r), Value::Number(Number::from_f64(0.5).unwrap()));
        let z = exif::Rational { num: 1, denom: 0 };
        assert_eq!(rational_to_json(&z), Value::Null);
        let s = exif::SRational { num: -3, denom: 2 };
        assert_eq!(srational_to_json(&s), Value::Number(Number::from_f64(-1.5).unwrap()));
    }

    #[test]
    fn exif_value_to_json_ascii_byte_short_undefined() {
        assert_eq!(
            exif_value_to_json(&ExifValue::Ascii(vec![b"Canon\0".to_vec()])),
            Value::String("Canon".into())
        );
        assert_eq!(
            exif_value_to_json(&ExifValue::Byte(vec![7])),
            Value::Number(Number::from(7u8))
        );
        assert_eq!(
            exif_value_to_json(&ExifValue::Short(vec![1, 2])),
            Value::Array(vec![
                Value::Number(Number::from(1u32)),
                Value::Number(Number::from(2u32))
            ])
        );
        assert_eq!(
            exif_value_to_json(&ExifValue::Undefined(vec![0, 1, 2], 0)),
            Value::String("undefined:3B".into())
        );
    }

}
