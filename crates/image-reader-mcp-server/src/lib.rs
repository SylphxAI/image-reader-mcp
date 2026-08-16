pub mod http_transport;
pub mod read_image;
pub mod tool_routes;

use rmcp::{
    handler::server::router::tool::ToolRouter,
    handler::server::wrapper::Parameters,
    model::{Implementation, ServerCapabilities, ServerInfo},
    tool, tool_handler, tool_router, ErrorData, ServerHandler,
};

pub const SERVER_NAME: &str = "iris";
pub const SERVER_VERSION: &str = "0.2.1";
pub const SERVER_INSTRUCTIONS: &str =
    "Evidence-first image reader MCP server (Rust rmcp transport). Use read_image for Agent Media Twin metadata and optional local Tesseract OCR, image_probe for cheap geometry, and crop_region for citeable pixel evidence. Unsupported layout, agent-map, semantics, and provider flags are rejected until their Rust authority is available.";

#[derive(Clone)]
pub struct ImageReaderMcp {
    pub tool_router: ToolRouter<Self>,
}

impl ImageReaderMcp {
    pub fn new() -> Self {
        Self {
            tool_router: Self::tool_router(),
        }
    }
}

#[tool_router]
impl ImageReaderMcp {
    #[tool(
        description = "Evidence-first image reader. Returns an Agent Media Twin with filename, mime, dimensions, optional local Tesseract OCR, optional region evidence, and trust warnings. No generative LLM is used. Unsupported layout, agent-map, semantics, and provider flags are rejected."
    )]
    fn read_image(
        &self,
        Parameters(args): Parameters<read_image::ReadImageArgs>,
    ) -> Result<rmcp::model::CallToolResult, ErrorData> {
        read_image::read_image_typed(args)
    }

    #[tool(
        description = "Cheap local image probe. Returns format, MIME, dimensions, pixel count, alpha/color information, source hash, and decode route."
    )]
    fn image_probe(
        &self,
        Parameters(args): Parameters<read_image::ImageProbeArgs>,
    ) -> Result<rmcp::model::CallToolResult, ErrorData> {
        read_image::image_probe(args)
    }

    #[tool(
        description = "Citeable local pixel crop. Returns the requested bounding box, PNG region hash, dimensions, and crop route; optionally includes PNG bytes."
    )]
    fn crop_region(
        &self,
        Parameters(args): Parameters<read_image::CropRegionArgs>,
    ) -> Result<rmcp::model::CallToolResult, ErrorData> {
        read_image::crop_region_tool(args)
    }
}

#[tool_handler]
impl ServerHandler for ImageReaderMcp {
    fn get_info(&self) -> ServerInfo {
        // rmcp >=1.8: ServerInfo/Implementation are #[non_exhaustive] — use builders only.
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(
                Implementation::new(SERVER_NAME, SERVER_VERSION)
                    .with_description(
                        "Rust-native MCP server for Iris (@sylphx/iris) (modelcontextprotocol/rust-sdk rmcp)",
                    )
                    .with_website_url("https://github.com/SylphxAI/image-reader-mcp"),
            )
            .with_instructions(SERVER_INSTRUCTIONS)
    }
}

#[cfg(test)]
mod tests {
    use super::{read_image, ImageReaderMcp, SERVER_VERSION};
    use serde_json::Value;

    #[test]
    fn exposes_primary_tool_surface() {
        let tools = ImageReaderMcp::new().tool_router.list_all();
        let names: Vec<_> = tools.iter().map(|tool| tool.name.to_string()).collect();
        assert_eq!(names, vec!["crop_region", "image_probe", "read_image"]);
    }

    #[test]
    fn publishes_required_paths_and_regions_in_tool_schemas() {
        let tools = ImageReaderMcp::new().tool_router.list_all();

        for name in ["read_image", "image_probe", "crop_region"] {
            let tool = tools
                .iter()
                .find(|tool| tool.name == name)
                .unwrap_or_else(|| panic!("missing tool {name}"));
            let required = tool
                .input_schema
                .get("required")
                .and_then(Value::as_array)
                .unwrap_or_else(|| panic!("{name} schema has no required fields"));
            assert!(required.iter().any(|field| field == "path"));
            assert_eq!(
                tool.input_schema.get("additionalProperties"),
                Some(&Value::Bool(false)),
                "{name} must reject unsupported arguments"
            );
            let properties = tool
                .input_schema
                .get("properties")
                .and_then(Value::as_object)
                .unwrap_or_else(|| panic!("{name} schema has no properties"));
            assert!(!properties.contains_key("max_file_bytes"));
            assert!(!properties.contains_key("max_pixels"));
            if name == "read_image" {
                for field in [
                    "include_ocr",
                    "include_ocr_words",
                    "ocr_languages",
                    "ocr_min_confidence",
                ] {
                    assert!(
                        properties.contains_key(field),
                        "read_image must expose {field}"
                    );
                }
            }
            if name == "crop_region" {
                assert!(required.iter().any(|field| field == "region"));
            }
        }
    }

    #[test]
    fn read_image_rejects_unsupported_provider_flags() {
        let parsed = serde_json::from_value::<read_image::ReadImageArgs>(serde_json::json!({
            "path": "/tmp/image.png",
            "include_layout": true,
        }));
        let error = parsed.expect_err("unsupported layout must not be silently accepted");
        assert!(error.to_string().contains("unknown field"));
    }

    #[test]
    fn server_info_is_brand_sole_iris() {
        use super::SERVER_NAME;
        use rmcp::ServerHandler;
        let info = ImageReaderMcp::new().get_info();
        let name = info.server_info.name.to_string();
        let version = info.server_info.version.to_string();
        assert_eq!(name, SERVER_NAME);
        assert_eq!(version, SERVER_VERSION);
        assert_eq!(SERVER_NAME, "iris");
        assert!(!name.contains("image-reader"));
    }
}
