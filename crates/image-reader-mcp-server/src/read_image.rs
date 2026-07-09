use image_reader_core::{read_image_from_value, ProbeErrorCode, READ_IMAGE_ROUTE};
use rmcp::model::CallToolResult;
use serde_json::Value;

pub fn read_image(args: Value) -> Result<CallToolResult, rmcp::ErrorData> {
    let success = read_image_from_value(&args).map_err(|error| match error.code {
        ProbeErrorCode::InvalidParams => rmcp::ErrorData::invalid_params(error.message, None),
        ProbeErrorCode::InvalidRequest => {
            rmcp::ErrorData::invalid_request(error.message, None)
        }
    })?;

    let structured = serde_json::json!({
        "tool": "read_image",
        "route": READ_IMAGE_ROUTE,
        "engine": image_reader_core::ENGINE_NAME,
        "twin": success.twin,
        "envelope": success.envelope,
    });

    Ok(CallToolResult::structured(structured))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn reads_fixture_through_rust_core_route() {
        let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../test/fixtures/sample.png");
        if !fixture.is_file() {
            return;
        }

        let result = read_image(serde_json::json!({
            "path": fixture,
            "include_metadata": false
        }))
        .expect("read_image");

        let structured = result.structured_content.expect("structured");
        assert_eq!(structured.get("route").and_then(Value::as_str), Some(READ_IMAGE_ROUTE));
        assert_eq!(
            structured
                .get("twin")
                .and_then(|value| value.get("mime"))
                .and_then(Value::as_str),
            Some("image/png")
        );
    }
}