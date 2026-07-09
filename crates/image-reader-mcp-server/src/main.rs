use image_reader_mcp_server::{http_transport, ImageReaderMcp, SERVER_VERSION};
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

    if http_transport::transport_from_env().is_some() {
        return http_transport::serve_http(http_transport::HttpConfig::from_env()).await;
    }

    let service = ImageReaderMcp::new().serve(rmcp::transport::stdio()).await?;
    service.waiting().await?;
    Ok(())
}