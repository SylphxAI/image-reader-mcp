//! Pure GPS redaction + trust-warning helpers ported from `src/utils/metadata.ts`.
//! No I/O. Callers supply already-extracted EXIF/XMP/IPTC maps.

use serde_json::{Map, Value};

const GPS_NESTED_KEYS: &[&str] = &[
    "latitude",
    "longitude",
    "altitude",
    "lat",
    "lon",
    "lng",
    "GPSLatitude",
    "GPSLongitude",
    "GPSAltitude",
    "GPSLatitudeRef",
    "GPSLongitudeRef",
    "GPSAltitudeRef",
    "GPSDateStamp",
    "GPSTimeStamp",
    "GPSProcessingMethod",
    "GPSAreaInformation",
    "GPSDOP",
    "GPSMapDatum",
    "GPSDestLatitude",
    "GPSDestLongitude",
    "GPSDestBearing",
    "GPSDestDistance",
    "GPSHPositioningError",
];

const GPS_PREFIXES: &[&str] = &["gps", "geo", "location", "latitude", "longitude", "altitude", "coordinates"];

fn is_gps_key(key: &str) -> bool {
    let lower = key.to_ascii_lowercase();
    if GPS_PREFIXES.iter().any(|p| lower.starts_with(p)) {
        return true;
    }
    GPS_NESTED_KEYS.iter().any(|k| *k == key)
}

fn redact_value(value: &Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.iter().map(redact_value).collect()),
        Value::Object(map) => {
            let (redacted, _) = redact_gps_fields_map(map);
            Value::Object(redacted)
        }
        _ => Value::String("[redacted]".into()),
    }
}

/// Redact GPS/geo fields from a metadata object tree.
/// Mirrors TS `redactGpsFields`.
pub fn redact_gps_fields(metadata: &Map<String, Value>) -> (Map<String, Value>, bool) {
    redact_gps_fields_map(metadata)
}

fn redact_gps_fields_map(metadata: &Map<String, Value>) -> (Map<String, Value>, bool) {
    let mut had_gps = false;
    let mut redacted = Map::new();

    for (key, value) in metadata {
        if key.eq_ignore_ascii_case("gps") && value.is_object() {
            had_gps = true;
            redacted.insert(key.clone(), Value::String("[redacted]".into()));
            continue;
        }

        if is_gps_key(key) {
            had_gps = true;
            redacted.insert(key.clone(), redact_value(value));
            continue;
        }

        if let Value::Object(nested) = value {
            let (nested_redacted, nested_had) = redact_gps_fields_map(nested);
            if nested_had {
                had_gps = true;
            }
            redacted.insert(key.clone(), Value::Object(nested_redacted));
            continue;
        }

        redacted.insert(key.clone(), value.clone());
    }

    (redacted, had_gps)
}

fn contains_ci(haystack: &str, needle: &str) -> bool {
    haystack.to_ascii_lowercase().contains(&needle.to_ascii_lowercase())
}

/// Collect trust warnings from metadata + GPS presence.
/// Mirrors TS `collectTrustWarnings` (uses original metadata for software/make/model).
pub fn collect_trust_warnings(metadata: &Map<String, Value>, had_gps: bool) -> Vec<String> {
    let mut warnings = Vec::new();

    if had_gps {
        warnings.push(
            "GPS coordinates were present in metadata and have been redacted from the response."
                .into(),
        );
    }

    let software = metadata
        .get("Software")
        .or_else(|| metadata.get("software"))
        .and_then(Value::as_str);
    if let Some(software) = software {
        let markers = [
            "photoshop",
            "gimp",
            "ai",
            "generative",
            "midjourney",
            "stable diffusion",
        ];
        // Match TS `/photoshop|gimp|ai|generative|midjourney|stable diffusion/i`
        // Note: bare "ai" is intentional parity with the TS oracle.
        if markers.iter().any(|m| contains_ci(software, m)) {
            warnings.push(format!(
                "EXIF Software field suggests possible editing or synthetic origin: \"{software}\"."
            ));
        }
    }

    let make = metadata
        .get("Make")
        .or_else(|| metadata.get("make"))
        .and_then(Value::as_str);
    let model = metadata
        .get("Model")
        .or_else(|| metadata.get("model"))
        .and_then(Value::as_str);
    if let (Some(make), Some(model)) = (make, model) {
        let combined = format!("{make} {model}");
        if ["unknown", "fake", "synthetic"]
            .iter()
            .any(|m| contains_ci(&combined, m))
        {
            warnings.push("Camera make/model metadata looks inconsistent or synthetic.".into());
        }
    }

    warnings
}

/// Convenience: redact + collect warnings in one call.
pub fn sanitize_metadata(metadata: &Map<String, Value>) -> (Map<String, Value>, Vec<String>) {
    let (redacted, had_gps) = redact_gps_fields(metadata);
    let warnings = collect_trust_warnings(metadata, had_gps);
    (redacted, warnings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn obj(v: Value) -> Map<String, Value> {
        v.as_object().cloned().expect("object")
    }

    #[test]
    fn redacts_top_level_gps_object() {
        let meta = obj(json!({
            "Make": "Canon",
            "GPS": { "latitude": 1.0, "longitude": 2.0 }
        }));
        let (redacted, had) = redact_gps_fields(&meta);
        assert!(had);
        assert_eq!(redacted.get("GPS").and_then(Value::as_str), Some("[redacted]"));
        assert_eq!(redacted.get("Make").and_then(Value::as_str), Some("Canon"));
    }

    #[test]
    fn redacts_gps_named_fields_and_nested() {
        let meta = obj(json!({
            "GPSLatitude": 37.7,
            "exif": {
                "longitude": -122.4,
                "ISO": 100
            }
        }));
        let (redacted, had) = redact_gps_fields(&meta);
        assert!(had);
        assert_eq!(
            redacted.get("GPSLatitude").and_then(Value::as_str),
            Some("[redacted]")
        );
        let exif = redacted.get("exif").and_then(Value::as_object).unwrap();
        assert_eq!(exif.get("longitude").and_then(Value::as_str), Some("[redacted]"));
        assert_eq!(exif.get("ISO").and_then(Value::as_i64), Some(100));
    }

    #[test]
    fn trust_warnings_for_gps_software_and_fake_camera() {
        let meta = obj(json!({
            "Software": "Adobe Photoshop 2024",
            "Make": "Unknown",
            "Model": "Synthetic Cam"
        }));
        let warnings = collect_trust_warnings(&meta, true);
        assert!(warnings.iter().any(|w| w.contains("GPS coordinates")));
        assert!(warnings.iter().any(|w| w.contains("Photoshop")));
        assert!(warnings.iter().any(|w| w.contains("inconsistent or synthetic")));
    }

    #[test]
    fn no_warnings_for_clean_metadata() {
        let meta = obj(json!({ "Make": "Sony", "Model": "A7IV", "Software": "RawTherapee" }));
        let warnings = collect_trust_warnings(&meta, false);
        assert!(warnings.is_empty());
    }

    #[test]
    fn sanitize_combines_redact_and_warnings() {
        let meta = obj(json!({ "GPSLatitude": 1.0, "Make": "Nikon" }));
        let (redacted, warnings) = sanitize_metadata(&meta);
        assert_eq!(
            redacted.get("GPSLatitude").and_then(Value::as_str),
            Some("[redacted]")
        );
        assert_eq!(redacted.get("Make").and_then(Value::as_str), Some("Nikon"));
        assert!(warnings.iter().any(|w| w.contains("GPS coordinates")));
    }

    #[test]
    fn midjourney_and_stable_diffusion_software_markers() {
        for software in ["Midjourney v6", "stable diffusion webui", "OpenAI generator"] {
            let meta = obj(json!({ "Software": software }));
            let warnings = collect_trust_warnings(&meta, false);
            assert!(
                warnings.iter().any(|w| w.contains("synthetic origin")),
                "software={software} warnings={warnings:?}"
            );
        }
    }

    #[test]
    fn bare_ai_substring_in_software_matches_ts_oracle() {
        // TS uses /...|ai|.../i — intentional bare-substring parity (e.g. "GIMP AI plugin").
        // Avoid any substring of markers (note: "Paint" contains bare "ai").
        let meta = obj(json!({ "Software": "Darktable" }));
        assert!(collect_trust_warnings(&meta, false).is_empty());
        let meta = obj(json!({ "Software": "MyAI Tool" }));
        let warnings = collect_trust_warnings(&meta, false);
        assert!(warnings.iter().any(|w| w.contains("MyAI Tool")), "{warnings:?}");
    }

    #[test]
    fn redacts_array_gps_values_and_coordinates_prefix() {
        let meta = obj(json!({
            "coordinates": [1.0, 2.0],
            "geoTag": "somewhere",
            "ISO": 200
        }));
        let (redacted, had) = redact_gps_fields(&meta);
        assert!(had);
        assert_eq!(
            redacted.get("coordinates"),
            Some(&json!(["[redacted]", "[redacted]"]))
        );
        assert_eq!(
            redacted.get("geoTag").and_then(Value::as_str),
            Some("[redacted]")
        );
        assert_eq!(redacted.get("ISO").and_then(Value::as_i64), Some(200));
    }

    #[test]
    fn sanitize_preserves_non_gps_nested_objects() {
        let meta = obj(json!({
            "exif": { "ISO": 400, "FNumber": 2.8 },
            "MakerNote": "ok"
        }));
        let (redacted, warnings) = sanitize_metadata(&meta);
        assert!(warnings.is_empty());
        let exif = redacted.get("exif").and_then(Value::as_object).unwrap();
        assert_eq!(exif.get("ISO").and_then(Value::as_i64), Some(400));
        assert_eq!(redacted.get("MakerNote").and_then(Value::as_str), Some("ok"));
    }



    #[test]
    fn redacts_nested_object_latitude_and_gps_keyed_array() {
        // Nested object keys are walked; arrays only redact when the parent key is GPS-tagged.
        let meta = obj(json!({
            "camera": {
                "latitude": 1.0,
                "name": "a"
            },
            "ISO": 100
        }));
        let (redacted, had) = redact_gps_fields(&meta);
        assert!(had);
        let camera = redacted.get("camera").and_then(Value::as_object).unwrap();
        assert_eq!(camera.get("latitude").and_then(Value::as_str), Some("[redacted]"));
        assert_eq!(camera.get("name").and_then(Value::as_str), Some("a"));
        assert_eq!(redacted.get("ISO").and_then(Value::as_i64), Some(100));

        let meta = obj(json!({
            "coordinates": [
                {"name": "pt", "note": "x"},
                9
            ]
        }));
        let (redacted, had) = redact_gps_fields(&meta);
        assert!(had);
        let coords = redacted.get("coordinates").and_then(Value::as_array).unwrap();
        // array under GPS-prefix key: objects recurse, scalars become [redacted]
        assert_eq!(coords[0].get("name").and_then(Value::as_str), Some("pt"));
        assert_eq!(coords[1].as_str(), Some("[redacted]"));
    }

    #[test]
    fn trust_warnings_case_insensitive_photoshop_marker() {
        let meta = obj(json!({ "Software": "ADOBE PHOTOSHOP Express" }));
        let warnings = collect_trust_warnings(&meta, false);
        assert!(warnings.iter().any(|w| w.to_lowercase().contains("photoshop") || w.contains("synthetic") || w.contains("Software")), "{warnings:?}");
    }

}
