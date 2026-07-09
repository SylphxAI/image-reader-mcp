//! Explicit shipped routing table for image-reader-mcp primary tools.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolRoute {
    RustCore,
    LegacyOptIn,
}

pub fn route_for_tool(tool: &str) -> Option<ToolRoute> {
    match tool {
        "read_image" | "image_probe" | "crop_region" => Some(ToolRoute::RustCore),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_read_image_to_rust_core() {
        assert_eq!(route_for_tool("read_image"), Some(ToolRoute::RustCore));
        assert_eq!(route_for_tool("image_probe"), Some(ToolRoute::RustCore));
        assert_eq!(route_for_tool("crop_region"), Some(ToolRoute::RustCore));
    }
}