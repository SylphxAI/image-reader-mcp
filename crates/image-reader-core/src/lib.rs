//! Rust image probe and hash engine for image-reader-mcp.

pub mod read_image;

pub use read_image::{
    read_image, read_image_from_value, AgentMediaTwin, ReadImageOptions, READ_IMAGE_ROUTE,
};

use std::fs;
use std::io::Cursor;
use std::path::Path;

use image::{GenericImageView, ImageFormat};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const ENGINE_NAME: &str = "image-reader-core";
pub const ENGINE_VERSION: &str = "0.1.0";
pub const DECODE_ROUTE: &str = "rust-probe";
pub const CROP_ROUTE: &str = "rust-crop";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionBBox {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionEvidence {
    pub bbox: RegionBBox,
    pub width: u32,
    pub height: u32,
    pub pixel_count: u64,
    pub region_hash: String,
    pub mime: String,
    pub route: String,
    pub resized: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_base64: Option<String>,
}

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
    pub(crate) fn invalid_params(message: impl Into<String>) -> Self {
        Self {
            code: ProbeErrorCode::InvalidParams,
            message: message.into(),
        }
    }

    pub(crate) fn invalid_request(message: impl Into<String>) -> Self {
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

fn read_image_bytes(path: &Path, max_file_bytes: u64) -> Result<Vec<u8>, ProbeError> {
    let meta = fs::metadata(path).map_err(|err| {
        ProbeError::invalid_request(format!("Unable to access image at '{}': {err}", path.display()))
    })?;

    if !meta.is_file() {
        return Err(ProbeError::invalid_request(format!(
            "Path '{}' is not a regular file.",
            path.display()
        )));
    }

    if meta.len() > max_file_bytes {
        return Err(ProbeError::invalid_request(format!(
            "Image file exceeds maximum size of {} bytes.",
            max_file_bytes
        )));
    }

    fs::read(path).map_err(|err| ProbeError::invalid_request(format!("Failed to read image bytes: {err}")))
}

fn validate_bbox(bbox: &RegionBBox, image_width: u32, image_height: u32) -> Result<(), ProbeError> {
    if bbox.width == 0 || bbox.height == 0 {
        return Err(ProbeError::invalid_params(
            "Region width and height must be positive.",
        ));
    }

    let right = bbox.x.saturating_add(bbox.width);
    let bottom = bbox.y.saturating_add(bbox.height);

    if right > image_width || bottom > image_height {
        return Err(ProbeError::invalid_params(format!(
            "Region ({}, {}, {}, {}) exceeds image bounds ({}x{}).",
            bbox.x, bbox.y, bbox.width, bbox.height, image_width, image_height
        )));
    }

    Ok(())
}

pub fn crop_region(
    path: &Path,
    max_file_bytes: u64,
    max_pixels: u64,
    bbox: RegionBBox,
    max_dimension: Option<u32>,
    include_image_base64: bool,
) -> Result<RegionEvidence, ProbeError> {
    let bytes = read_image_bytes(path, max_file_bytes)?;
    let image = image::load_from_memory(&bytes).map_err(|err| {
        ProbeError::invalid_request(format!("Failed to decode image for crop: {err}"))
    })?;

    let (image_width, image_height) = image.dimensions();
    validate_bbox(&bbox, image_width, image_height)?;

    let source_pixels = u64::from(bbox.width) * u64::from(bbox.height);
    if source_pixels > max_pixels {
        return Err(ProbeError::invalid_request(format!(
            "Cropped region exceeds the {} pixel safety budget.",
            max_pixels
        )));
    }

    let cropped = image.crop_imm(bbox.x, bbox.y, bbox.width, bbox.height);
    let (mut output_width, mut output_height) = cropped.dimensions();
    let mut resized = false;

    if let Some(limit) = max_dimension {
        if limit > 0 && (output_width > limit || output_height > limit) {
            let scale = f64::from(limit)
                / f64::from(output_width.max(output_height));
            output_width = ((f64::from(output_width) * scale).round() as u32).max(1);
            output_height = ((f64::from(output_height) * scale).round() as u32).max(1);
            resized = true;
        }
    }

    let rendered = if resized {
        image::DynamicImage::ImageRgba8(image::imageops::resize(
            &cropped,
            output_width,
            output_height,
            image::imageops::FilterType::Triangle,
        ))
    } else {
        cropped
    };

    let pixel_count = u64::from(output_width) * u64::from(output_height);
    if pixel_count > max_pixels {
        return Err(ProbeError::invalid_request(format!(
            "Resized region exceeds the {} pixel safety budget.",
            max_pixels
        )));
    }

    let mut png_bytes = Vec::new();
    rendered
        .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
        .map_err(|err| ProbeError::invalid_request(format!("Failed to encode cropped PNG: {err}")))?;

    let region_hash = format!("{:x}", Sha256::digest(&png_bytes));
    let image_base64 = if include_image_base64 {
        Some(base64_encode(&png_bytes))
    } else {
        None
    };

    Ok(RegionEvidence {
        bbox,
        width: output_width,
        height: output_height,
        pixel_count,
        region_hash,
        mime: "image/png".into(),
        route: CROP_ROUTE.into(),
        resized,
        image_base64,
    })
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    let mut index = 0;

    while index + 3 <= bytes.len() {
        let chunk = u32::from(bytes[index]) << 16
            | u32::from(bytes[index + 1]) << 8
            | u32::from(bytes[index + 2]);
        out.push(TABLE[((chunk >> 18) & 63) as usize] as char);
        out.push(TABLE[((chunk >> 12) & 63) as usize] as char);
        out.push(TABLE[((chunk >> 6) & 63) as usize] as char);
        out.push(TABLE[(chunk & 63) as usize] as char);
        index += 3;
    }

    let remainder = bytes.len() - index;
    if remainder == 1 {
        let chunk = u32::from(bytes[index]) << 16;
        out.push(TABLE[((chunk >> 18) & 63) as usize] as char);
        out.push(TABLE[((chunk >> 12) & 63) as usize] as char);
        out.push('=');
        out.push('=');
    } else if remainder == 2 {
        let chunk = u32::from(bytes[index]) << 16 | u32::from(bytes[index + 1]) << 8;
        out.push(TABLE[((chunk >> 18) & 63) as usize] as char);
        out.push(TABLE[((chunk >> 12) & 63) as usize] as char);
        out.push(TABLE[((chunk >> 6) & 63) as usize] as char);
        out.push('=');
    }

    out
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

    #[test]
    fn crops_region_with_hash_and_route() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("crop.png");
        let img = image::RgbaImage::from_pixel(20, 10, image::Rgba([255, 0, 0, 255]));
        img.save(&path).expect("save png");

        let evidence = crop_region(
            &path,
            32 * 1024 * 1024,
            64 * 1024 * 1024,
            RegionBBox {
                x: 4,
                y: 2,
                width: 8,
                height: 4,
            },
            None,
            false,
        )
        .expect("crop");

        assert_eq!(evidence.width, 8);
        assert_eq!(evidence.height, 4);
        assert_eq!(evidence.pixel_count, 32);
        assert_eq!(evidence.route, CROP_ROUTE);
        assert!(!evidence.region_hash.is_empty());
        assert!(evidence.image_base64.is_none());
    }

    #[test]
    fn resizes_large_crops_when_max_dimension_is_set() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("resize.png");
        let img = image::RgbaImage::from_pixel(40, 20, image::Rgba([0, 255, 0, 255]));
        img.save(&path).expect("save png");

        let evidence = crop_region(
            &path,
            32 * 1024 * 1024,
            64 * 1024 * 1024,
            RegionBBox {
                x: 0,
                y: 0,
                width: 40,
                height: 20,
            },
            Some(10),
            true,
        )
        .expect("crop");

        assert!(evidence.resized);
        assert_eq!(evidence.width, 10);
        assert_eq!(evidence.height, 5);
        assert!(evidence.image_base64.as_ref().is_some_and(|value| !value.is_empty()));
    }
}