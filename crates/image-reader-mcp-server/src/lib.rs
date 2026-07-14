pub mod http_transport;
pub mod read_image;
pub mod tool_routes;

use rmcp::{
    handler::server::router::tool::ToolRouter,
    handler::server::wrapper::Parameters,
    model::{Implementation, ServerCapabilities, ServerInfo},
    tool, tool_handler, tool_router, ErrorData, ServerHandler,
};
use serde_json::Value;

pub const SERVER_NAME: &str = "image-reader-mcp";
pub const SERVER_VERSION: &str = "0.1.0";
pub const SERVER_INSTRUCTIONS: &str =
    "Evidence-first image reader MCP server (Rust rmcp transport). Use read_image for Agent Media Twin metadata, optional region evidence, and trust warnings without generative LLM.";

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
        description = "Evidence-first image reader. Returns an Agent Media Twin with filename, mime, dimensions, optional region evidence, and trust warnings. No generative LLM is used."
    )]
    pub fn read_image(
        &self,
        Parameters(args): Parameters<Value>,
    ) -> Result<rmcp::model::CallToolResult, ErrorData> {
        read_image::read_image(args)
    }
}

#[tool_handler]
impl ServerHandler for ImageReaderMcp {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            protocol_version: rmcp::model::ProtocolVersion::default(),
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            server_info: Implementation {
                name: SERVER_NAME.into(),
                title: None,
                version: SERVER_VERSION.into(),
                description: Some(
                    "Rust-native MCP server for image-reader-mcp (modelcontextprotocol/rust-sdk rmcp)"
                        .into(),
                ),
                icons: None,
                website_url: Some("https://github.com/SylphxAI/image-reader-mcp".into()),
            },
            instructions: Some(SERVER_INSTRUCTIONS.into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::ImageReaderMcp;
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn rmcp_server_sources_route_read_image_through_rust_core() {
        let src_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src");
        let lib_rs = fs::read_to_string(src_dir.join("lib.rs")).expect("read lib.rs");
        let production_lib = lib_rs.split("#[cfg(test)]").next().unwrap_or(&lib_rs);
        assert!(production_lib.contains("read_image::read_image"));

        let routes = fs::read_to_string(src_dir.join("tool_routes.rs")).expect("read tool_routes");
        assert!(routes.contains("read_image"));
        assert!(routes.contains("RustCore"));
    }

    #[test]
    fn exposes_read_image_tool_surface() {
        let tools = ImageReaderMcp::new().tool_router.list_all();
        let names: Vec<_> = tools.iter().map(|tool| tool.name.to_string()).collect();
        assert!(names.contains(&"read_image".to_string()));
    }
}