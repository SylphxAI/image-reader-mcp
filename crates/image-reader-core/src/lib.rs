//! Rust image probe and hash engine for image-reader-mcp.

use std::fs;
use std::io::Cursor;
use std::path::Path;

use image::ImageFormat;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const ENGINE_NAME: &str = "image-reader-core";
pub const ENGINE_VERSION: &str = "0.1.0";
pub const DECODE_ROUTE: &str = "rust-probe";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageProbe {
    pub format: String,
    pub mime: String,
    pub width: u32,
    pub height: u32,
    pub pixel_count: u64,
    pub has_alpha: bool,
    pub color_type: String,
    pub source_hash: String,
    pub file_size: u64,
    pub route: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProbeErrorCode {
    InvalidParams,
    InvalidRequest,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProbeError {
    pub code: ProbeErrorCode,
    pub message: String,
}

impl ProbeError {
    fn invalid_params(message: impl Into<String>) -> Self {
        Self {
            code: ProbeErrorCode::InvalidParams,
            message: message.into(),
        }
    }

    fn invalid_request(message: impl Into<String>) -> Self {
        Self {
            code: ProbeErrorCode::InvalidRequest,
            message: message.into(),
        }
    }
}

pub fn probe_image(path: &Path, max_file_bytes: u64) -> Result<ImageProbe, ProbeError> {
    let meta = fs::metadata(path).map_err(|err| {
        ProbeError::invalid_request(format!("Unable to access image at '{}': {err}", path.display()))
    })?;

    if !meta.is_file() {
        return Err(ProbeError::invalid_request(format!(
            "Path '{}' is not a regular file.",
            path.display()
        )));
    }

    let file_size = meta.len();
    if file_size > max_file_bytes {
        return Err(ProbeError::invalid_request(format!(
            "Image file exceeds maximum size of {} bytes.",
            max_file_bytes
        )));
    }

    let bytes = fs::read(path).map_err(|err| {
        ProbeError::invalid_request(format!("Failed to read image bytes: {err}"))
    })?;

    let source_hash = format!("{:x}", Sha256::digest(&bytes));
    let format = image::guess_format(&bytes).map_err(|err| {
        ProbeError::invalid_request(format!("Unable to determine image format: {err}"))
    })?;

    let (width, height) = image::ImageReader::new(Cursor::new(&bytes))
        .with_guessed_format()
        .map_err(|err| ProbeError::invalid_request(format!("Invalid image structure: {err}")))?
        .into_dimensions()
        .map_err(|err| ProbeError::invalid_request(format!("Invalid image dimensions: {err}")))?;

    if width == 0 || height == 0 {
        return Err(ProbeError::invalid_request(
            "Image dimensions must be positive.",
        ));
    }

    let pixel_count = u64::from(width) * u64::from(height);
    let color_type = color_type_label(format);
    let has_alpha = infer_has_alpha(format, &bytes);

    Ok(ImageProbe {
        format: format_label(format),
        mime: mime_for_format(format),
        width,
        height,
        pixel_count,
        has_alpha,
        color_type,
        source_hash,
        file_size,
        route: DECODE_ROUTE.into(),
    })
}

fn format_label(format: ImageFormat) -> String {
    match format {
        ImageFormat::Png => "png".into(),
        ImageFormat::Jpeg => "jpeg".into(),
        ImageFormat::Gif => "gif".into(),
        ImageFormat::WebP => "webp".into(),
        ImageFormat::Tiff => "tiff".into(),
        ImageFormat::Bmp => "bmp".into(),
        other => format!("{other:?}").to_lowercase(),
    }
}

fn mime_for_format(format: ImageFormat) -> String {
    match format {
        ImageFormat::Png => "image/png".into(),
        ImageFormat::Jpeg => "image/jpeg".into(),
        ImageFormat::Gif => "image/gif".into(),
        ImageFormat::WebP => "image/webp".into(),
        ImageFormat::Tiff => "image/tiff".into(),
        ImageFormat::Bmp => "image/bmp".into(),
        other => format!("image/{}", format_label(other)),
    }
}

fn color_type_label(format: ImageFormat) -> String {
    match format {
        ImageFormat::Png | ImageFormat::WebP | ImageFormat::Gif => "rgba-capable".into(),
        ImageFormat::Jpeg => "rgb".into(),
        ImageFormat::Tiff | ImageFormat::Bmp => "palette-or-rgb".into(),
        _ => "unknown".into(),
    }
}

fn infer_has_alpha(format: ImageFormat, bytes: &[u8]) -> bool {
    if format == ImageFormat::Png {
        // IHDR color type 4 (grayscale+alpha) or 6 (rgba) => byte offset 25 in standard PNG.
        return bytes.len() > 25 && matches!(bytes[25], 4 | 6);
    }
    matches!(format, ImageFormat::WebP | ImageFormat::Gif)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn probes_generated_png_fixture() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("probe.png");
        let img = image::RgbaImage::from_pixel(12, 8, image::Rgba([10, 20, 30, 255]));
        img.save(&path).expect("save png");

        let probe = probe_image(&path, 32 * 1024 * 1024).expect("probe");
        assert_eq!(probe.width, 12);
        assert_eq!(probe.height, 8);
        assert_eq!(probe.pixel_count, 96);
        assert_eq!(probe.format, "png");
        assert_eq!(probe.mime, "image/png");
        assert_eq!(probe.route, DECODE_ROUTE);
        assert!(!probe.source_hash.is_empty());
    }

    #[test]
    fn rejects_oversized_files_before_decode() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("big.png");
        let mut file = fs::File::create(&path).expect("create");
        file.write_all(&[0u8; 64]).expect("write");
        let err = probe_image(&path, 32).expect_err("oversized");
        assert_eq!(err.code, ProbeErrorCode::InvalidRequest);
    }
}