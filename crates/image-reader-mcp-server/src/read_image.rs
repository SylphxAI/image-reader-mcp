use image_reader_core::read_image::{DEFAULT_MAX_FILE_BYTES, DEFAULT_MAX_PIXELS};
use image_reader_core::{
    crop_region as core_crop_region, probe_image, read_image_from_value, ProbeErrorCode, RegionBBox,
};
use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;

use crate::SERVER_VERSION;

pub const READ_IMAGE_ROUTE: &str = "rust-read-image-v1";
pub const IMAGE_PROBE_ROUTE: &str = "rust-image-probe-v1";
pub const CROP_REGION_ROUTE: &str = "rust-crop-region-v1";

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct RegionArgs {
    /// Left edge in source pixels.
    pub x: u32,
    /// Top edge in source pixels.
    pub y: u32,
    /// Region width in source pixels.
    pub width: u32,
    /// Region height in source pixels.
    pub height: u32,
}

impl From<RegionArgs> for RegionBBox {
    fn from(region: RegionArgs) -> Self {
        Self {
            x: region.x,
            y: region.y,
            width: region.width,
            height: region.height,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReadImageArgs {
    /// Absolute or current-working-directory-relative local image path.
    pub path: String,
    /// Include EXIF metadata when present. Defaults to true.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_metadata: Option<bool>,
    /// Optional source pixel region to attach as citeable evidence.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub region: Option<RegionArgs>,
    /// Include base64 PNG bytes when region evidence is requested.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_region_image: Option<bool>,
    /// Optional maximum width or height for the rendered region evidence.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_region_dimension: Option<u32>,
}

impl ReadImageArgs {
    fn into_value(self) -> Result<Value, rmcp::ErrorData> {
        serde_json::to_value(self).map_err(|error| {
            rmcp::ErrorData::invalid_params(
                format!("failed to serialize read_image parameters: {error}"),
                None,
            )
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct ImageProbeArgs {
    /// Absolute or current-working-directory-relative local image path.
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct CropRegionArgs {
    /// Absolute or current-working-directory-relative local image path.
    pub path: String,
    /// Source pixel region to crop.
    pub region: RegionArgs,
    /// Optional maximum width or height for the rendered region evidence.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_region_dimension: Option<u32>,
    /// Include base64 PNG bytes of the cropped region.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_region_image: Option<bool>,
}

fn with_family_envelope(tool: &str, route_path: &str, mut body: Value) -> Value {
    let obj = body.as_object_mut().expect("structured body object");
    let warnings = obj
        .get("envelope")
        .and_then(|e| e.get("warnings"))
        .cloned()
        .unwrap_or_else(|| json!([]));
    let gaps = obj.get("gaps").cloned().unwrap_or_else(|| json!([]));
    let status = obj
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("ok")
        .to_string();
    let path = obj
        .get("envelope")
        .and_then(|e| {
            e.get("source")
                .or_else(|| e.get("source_path"))
                .or_else(|| e.get("locator").and_then(|l| l.get("path")))
        })
        .cloned();
    let source_hash = obj
        .get("envelope")
        .and_then(|e| e.get("sourceHash").or_else(|| e.get("source_hash")))
        .cloned();

    if let Some(envelope) = obj.get_mut("envelope").and_then(Value::as_object_mut) {
        envelope.insert("product_version".into(), json!(SERVER_VERSION));
    }

    obj.insert("envelope_version".into(), json!("1"));
    obj.insert("status".into(), json!(status));
    obj.insert("tool".into(), json!(tool));
    obj.insert("product".into(), json!("iris"));
    obj.insert("product_version".into(), json!(SERVER_VERSION));
    obj.insert(
        "route".into(),
        json!({ "engine": "rust-core", "path": route_path }),
    );
    // Preserve string route for legacy tests under domain_route if needed.
    obj.insert("domain_route".into(), json!(route_path));
    obj.entry("warnings".to_string()).or_insert(warnings);
    obj.entry("gaps".to_string()).or_insert(gaps);
    obj.entry("confidence".to_string())
        .or_insert(json!({ "kind": "deterministic", "notes": [] }));
    if let Some(p) = path {
        obj.entry("source".to_string())
            .or_insert(json!({ "path": p }));
    }
    if let Some(hash) = source_hash {
        obj.entry("sourceHash".to_string()).or_insert(hash);
    }
    if let Some(payload) = obj
        .get("twin")
        .cloned()
        .or_else(|| obj.get("probe").cloned())
        .or_else(|| obj.get("region_evidence").cloned())
    {
        obj.entry("payload".to_string()).or_insert(payload);
    }
    body
}

fn map_probe_error(error: image_reader_core::ProbeError) -> rmcp::ErrorData {
    match error.code {
        ProbeErrorCode::InvalidParams => rmcp::ErrorData::invalid_params(error.message, None),
        ProbeErrorCode::InvalidRequest => rmcp::ErrorData::invalid_request(error.message, None),
    }
}

pub fn read_image(args: Value) -> Result<CallToolResult, rmcp::ErrorData> {
    serde_json::from_value::<ReadImageArgs>(args.clone()).map_err(|error| {
        rmcp::ErrorData::invalid_params(format!("invalid read_image parameters: {error}"), None)
    })?;
    let success = read_image_from_value(&args).map_err(map_probe_error)?;

    let structured = with_family_envelope(
        "read_image",
        READ_IMAGE_ROUTE,
        serde_json::json!({
            "tool": "read_image",
            "route": READ_IMAGE_ROUTE,
            "engine": image_reader_core::ENGINE_NAME,
            "twin": success.twin,
            "envelope": success.envelope,
            "status": "ok",
            "warnings": success.envelope.warnings.clone(),
            "gaps": [],
        }),
    );

    Ok(CallToolResult::structured(structured))
}

pub(crate) fn read_image_typed(args: ReadImageArgs) -> Result<CallToolResult, rmcp::ErrorData> {
    read_image(args.into_value()?)
}

pub(crate) fn image_probe(args: ImageProbeArgs) -> Result<CallToolResult, rmcp::ErrorData> {
    let path = PathBuf::from(&args.path);
    let probe = probe_image(&path, DEFAULT_MAX_FILE_BYTES).map_err(map_probe_error)?;
    let source_hash = probe.source_hash.clone();
    let structured = with_family_envelope(
        "image_probe",
        IMAGE_PROBE_ROUTE,
        json!({
            "status": "ok",
            "probe": probe,
            "envelope": {
                "source": args.path,
                "sourceHash": source_hash,
                "warnings": [],
                "gaps": [],
            },
        }),
    );
    Ok(CallToolResult::structured(structured))
}

pub(crate) fn crop_region_tool(args: CropRegionArgs) -> Result<CallToolResult, rmcp::ErrorData> {
    let path = PathBuf::from(&args.path);
    // Probe once for source hash/provenance before the crop operation. The core crop route
    // intentionally reports the derived region hash; the family envelope carries source hash.
    let probe = probe_image(&path, DEFAULT_MAX_FILE_BYTES).map_err(map_probe_error)?;
    let source_hash = probe.source_hash.clone();
    let evidence = core_crop_region(
        &path,
        DEFAULT_MAX_FILE_BYTES,
        DEFAULT_MAX_PIXELS,
        args.region.into(),
        args.max_region_dimension,
        args.include_region_image.unwrap_or(false),
    )
    .map_err(map_probe_error)?;
    let warnings = vec![
        format!(
            "Decode route: {} (source hash {}…).",
            probe.route,
            &source_hash[..12.min(source_hash.len())]
        ),
        format!(
            "Region evidence: {} (hash {}…).",
            evidence.route,
            &evidence.region_hash[..12.min(evidence.region_hash.len())]
        ),
    ];
    let structured = with_family_envelope(
        "crop_region",
        CROP_REGION_ROUTE,
        json!({
            "status": "ok",
            "region_evidence": evidence,
            "envelope": {
                "source": args.path,
                "sourceHash": source_hash,
                "warnings": warnings,
                "gaps": [],
            },
        }),
    );
    Ok(CallToolResult::structured(structured))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn reads_fixture_through_rust_core_route() {
        let fixture =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../test/fixtures/sample.png");
        if !fixture.is_file() {
            return;
        }

        let result = read_image(serde_json::json!({
            "path": fixture,
            "include_metadata": false
        }))
        .expect("read_image");

        let structured = result.structured_content.expect("structured");
        assert_eq!(
            structured.get("domain_route").and_then(Value::as_str),
            Some(READ_IMAGE_ROUTE)
        );
        assert_eq!(
            structured.get("envelope_version").and_then(Value::as_str),
            Some("1")
        );
        assert_eq!(
            structured.get("product").and_then(Value::as_str),
            Some("iris")
        );
        assert_eq!(
            structured
                .get("envelope")
                .and_then(|value| value.get("product_version"))
                .and_then(Value::as_str),
            Some(SERVER_VERSION)
        );
        assert_eq!(
            structured
                .get("route")
                .and_then(|r| r.get("engine"))
                .and_then(Value::as_str),
            Some("rust-core")
        );
        assert_eq!(
            structured
                .get("twin")
                .and_then(|value| value.get("mime"))
                .and_then(Value::as_str),
            Some("image/png")
        );
    }

    #[test]
    fn direct_read_image_route_rejects_unsupported_flags() {
        let error = read_image(serde_json::json!({
            "path": "/tmp/image.png",
            "include_layout": true,
        }))
        .expect_err("unsupported layout must not be silently ignored");
        assert_eq!(error.code, rmcp::model::ErrorCode::INVALID_PARAMS);
        assert!(error.message.contains("unknown field"));
    }

    #[test]
    fn image_probe_returns_family_provenance_and_decode_route() {
        let fixture =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../test/fixtures/sample.png");
        if !fixture.is_file() {
            return;
        }

        let result = image_probe(ImageProbeArgs {
            path: fixture.display().to_string(),
        })
        .expect("image_probe");
        let structured = result.structured_content.expect("structured");
        assert_eq!(
            structured.get("tool").and_then(Value::as_str),
            Some("image_probe")
        );
        assert_eq!(
            structured.get("envelope_version").and_then(Value::as_str),
            Some("1")
        );
        assert_eq!(
            structured
                .get("probe")
                .and_then(|probe| probe.get("route"))
                .and_then(Value::as_str),
            Some(image_reader_core::DECODE_ROUTE)
        );
        assert!(structured
            .get("sourceHash")
            .and_then(Value::as_str)
            .is_some());
    }

    #[test]
    fn crop_region_returns_family_provenance_and_region_hash() {
        let fixture =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../test/fixtures/sample.png");
        if !fixture.is_file() {
            return;
        }

        let result = crop_region_tool(CropRegionArgs {
            path: fixture.display().to_string(),
            region: RegionArgs {
                x: 4,
                y: 2,
                width: 10,
                height: 6,
            },
            max_region_dimension: None,
            include_region_image: None,
        })
        .expect("crop_region");
        let structured = result.structured_content.expect("structured");
        assert_eq!(
            structured.get("tool").and_then(Value::as_str),
            Some("crop_region")
        );
        assert_eq!(
            structured
                .get("region_evidence")
                .and_then(|evidence| evidence.get("route"))
                .and_then(Value::as_str),
            Some(image_reader_core::CROP_ROUTE)
        );
        assert!(structured
            .get("region_evidence")
            .and_then(|evidence| evidence.get("regionHash"))
            .and_then(Value::as_str)
            .is_some_and(|hash| !hash.is_empty()));
        assert!(structured
            .get("sourceHash")
            .and_then(Value::as_str)
            .is_some());
    }
}
