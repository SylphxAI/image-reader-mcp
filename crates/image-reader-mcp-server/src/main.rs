use image_reader_mcp_server::{ImageReaderMcp, SERVER_VERSION};
use rmcp::ServiceExt;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    if std::env::args().nth(1).as_deref() == Some("doctor") {
        eprintln!(
            "image-reader-mcp Rust MCP server {SERVER_VERSION} ({})",
            image_reader_core::ENGINE_NAME
        );
        return Ok(());
    }

    let service = ImageReaderMcp::new().serve(rmcp::transport::stdio()).await?;
    service.waiting().await?;
    Ok(())
}