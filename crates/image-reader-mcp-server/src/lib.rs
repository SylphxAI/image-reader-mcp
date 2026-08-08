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

pub const SERVER_NAME: &str = "iris";
pub const SERVER_VERSION: &str = "0.2.1";
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
                        "Rust-native MCP server for Iris (@sylphx/iris) (modelcontextprotocol/rust-sdk rmcp)",
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

    #[test]
    fn server_info_is_brand_sole_iris() {
        use rmcp::ServerHandler;
        use super::{SERVER_NAME, SERVER_VERSION};
        let info = ImageReaderMcp::new().get_info();
        let name = info.server_info.name.to_string();
        let version = info.server_info.version.to_string();
        assert_eq!(name, SERVER_NAME);
        assert_eq!(version, SERVER_VERSION);
        assert_eq!(SERVER_NAME, "iris");
        assert!(!name.contains("image-reader"));
    }
}
