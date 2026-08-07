use image_reader_core::{read_image_from_value, ProbeErrorCode, READ_IMAGE_ROUTE};
use rmcp::model::CallToolResult;
use serde_json::{json, Value};

use crate::SERVER_VERSION;

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
        .and_then(|e| e.get("source").or_else(|| e.get("source_path")).or_else(|| e.get("locator").and_then(|l| l.get("path"))))
        .cloned();

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
    obj.entry("warnings".to_string())
        .or_insert(warnings);
    obj.entry("gaps".to_string()).or_insert(gaps);
    obj.entry("confidence".to_string())
        .or_insert(json!({ "kind": "deterministic", "notes": [] }));
    if let Some(p) = path {
        obj.entry("source".to_string())
            .or_insert(json!({ "path": p }));
    }
    if let Some(twin) = obj.get("twin").cloned() {
        obj.entry("payload".to_string()).or_insert(twin);
    }
    body
}

pub fn read_image(args: Value) -> Result<CallToolResult, rmcp::ErrorData> {
    let success = read_image_from_value(&args).map_err(|error| match error.code {
        ProbeErrorCode::InvalidParams => rmcp::ErrorData::invalid_params(error.message, None),
        ProbeErrorCode::InvalidRequest => {
            rmcp::ErrorData::invalid_request(error.message, None)
        }
    })?;

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
}
