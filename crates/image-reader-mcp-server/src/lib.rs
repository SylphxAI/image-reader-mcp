pub mod http_transport;
pub mod read_image;
pub mod tool_routes;

use rmcp::{
    handler::server::router::tool::ToolRouter,
    handler::server::wrapper::Parameters,
    model::{Implementation, ServerCapabilities, ServerInfo},
    tool, tool_handler, tool_router, ErrorData, ServerHandler,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// Free-form MCP tool args object (root type=object required by rmcp ≥1.8 schema gate).
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
struct FreeformToolArgs(Map<String, Value>);

impl FreeformToolArgs {
    fn into_value(self) -> Value {
        Value::Object(self.0)
    }
}

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
    fn read_image(
        &self,
        Parameters(args): Parameters<FreeformToolArgs>,
    ) -> Result<rmcp::model::CallToolResult, ErrorData> {
        read_image::read_image(args.into_value())
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
                        "Rust-native MCP server for image-reader-mcp (modelcontextprotocol/rust-sdk rmcp)",
                    )
                    .with_website_url("https://github.com/SylphxAI/image-reader-mcp"),
            )
            .with_instructions(SERVER_INSTRUCTIONS)
    }
}

#[cfg(test)]
mod tests {
    use super::ImageReaderMcp;
    #[test]
    fn exposes_read_image_tool_surface() {
        let tools = ImageReaderMcp::new().tool_router.list_all();
        let names: Vec<_> = tools.iter().map(|tool| tool.name.to_string()).collect();
        assert!(names.contains(&"read_image".to_string()));
    }
}
