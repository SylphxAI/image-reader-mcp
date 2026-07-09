use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::{
    build_read_image_envelope, crop_region, probe_image, AgentEvidenceEnvelope, EnvelopeInput,
    ProbeError, RegionBBox, RegionEvidence,
};

pub const READ_IMAGE_ROUTE: &str = "rust-read-image-v1";
pub const DEFAULT_MAX_FILE_BYTES: u64 = 32 * 1024 * 1024;
pub const DEFAULT_MAX_PIXELS: u64 = 64 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct ReadImageOptions {
    pub max_file_bytes: u64,
    pub max_pixels: u64,
    pub include_metadata: bool,
    pub region: Option<RegionBBox>,
    pub max_region_dimension: Option<u32>,
    pub include_region_image: bool,
}

impl Default for ReadImageOptions {
    fn default() -> Self {
        Self {
            max_file_bytes: DEFAULT_MAX_FILE_BYTES,
            max_pixels: DEFAULT_MAX_PIXELS,
            include_metadata: true,
            region: None,
            max_region_dimension: None,
            include_region_image: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ImageDimensions {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RegionEvidenceTwin {
    pub bbox: RegionBBox,
    pub dimensions: ImageDimensions,
    pub region_hash: String,
    pub mime: String,
    pub route: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resized: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_base64: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AgentMediaTwin {
    pub filename: String,
    pub mime: String,
    pub dimensions: ImageDimensions,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_alpha: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_space: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub region_evidence: Option<RegionEvidenceTwin>,
    pub trust_warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReadImageSuccess {
    pub twin: AgentMediaTwin,
    pub envelope: AgentEvidenceEnvelope,
}

pub fn read_image_with_envelope(
    path: &Path,
    options: ReadImageOptions,
) -> Result<ReadImageSuccess, ProbeError> {
    let probe = probe_image(path, options.max_file_bytes)?;
    let twin = read_image_from_probe(path, &probe, &options)?;
    let envelope = build_read_image_envelope(EnvelopeInput {
        source_path: path,
        detected_format: probe.mime.clone(),
        source_hash: Some(probe.source_hash.clone()),
        decode_route: probe.route.clone(),
        warnings: twin.trust_warnings.clone(),
        twin: twin.clone(),
    });
    Ok(ReadImageSuccess { twin, envelope })
}

pub fn read_image(path: &Path, options: ReadImageOptions) -> Result<AgentMediaTwin, ProbeError> {
    Ok(read_image_with_envelope(path, options)?.twin)
}

fn read_image_from_probe(
    path: &Path,
    probe: &crate::ImageProbe,
    options: &ReadImageOptions,
) -> Result<AgentMediaTwin, ProbeError> {
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("image")
        .to_string();

    let mut trust_warnings = vec![format!(
        "Decode route: {} (source hash {}…).",
        probe.route,
        &probe.source_hash[..12.min(probe.source_hash.len())]
    )];

    if options.include_metadata {
        trust_warnings.push(
            "EXIF/XMP/IPTC metadata extraction is not available on the default Rust read_image route; use IMAGE_READER_MCP_TRANSPORT=ts for full metadata.".into(),
        );
    }

    let mut region_evidence = None;
    if let Some(bbox) = options.region.as_ref().copied() {
        let evidence = crop_region(
            path,
            options.max_file_bytes,
            options.max_pixels,
            bbox,
            options.max_region_dimension,
            options.include_region_image,
        )?;
        trust_warnings.push(format!(
            "Region evidence: {} (hash {}…).",
            evidence.route,
            &evidence.region_hash[..12.min(evidence.region_hash.len())]
        ));
        region_evidence = Some(map_region_evidence(evidence));
    }

    Ok(AgentMediaTwin {
        filename,
        mime: probe.mime.clone(),
        dimensions: ImageDimensions {
            width: probe.width,
            height: probe.height,
        },
        has_alpha: Some(probe.has_alpha),
        color_space: Some(probe.color_type.clone()),
        region_evidence,
        trust_warnings,
    })
}

fn map_region_evidence(evidence: RegionEvidence) -> RegionEvidenceTwin {
    RegionEvidenceTwin {
        bbox: evidence.bbox,
        dimensions: ImageDimensions {
            width: evidence.width,
            height: evidence.height,
        },
        region_hash: evidence.region_hash,
        mime: evidence.mime,
        route: evidence.route,
        resized: if evidence.resized { Some(true) } else { None },
        image_base64: evidence.image_base64,
    }
}

pub fn read_image_from_value(input: &serde_json::Value) -> Result<ReadImageSuccess, ProbeError> {
    let path = input
        .get("path")
        .and_then(|value| value.as_str())
        .ok_or_else(|| ProbeError::invalid_params("path is required"))?;

    let include_metadata = input
        .get("include_metadata")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);

    let include_region_image = input
        .get("include_region_image")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);

    let max_file_bytes = input
        .get("max_file_bytes")
        .and_then(|value| value.as_u64())
        .unwrap_or(DEFAULT_MAX_FILE_BYTES);

    let max_pixels = input
        .get("max_pixels")
        .and_then(|value| value.as_u64())
        .unwrap_or(DEFAULT_MAX_PIXELS);

    let max_region_dimension = input
        .get("max_region_dimension")
        .and_then(|value| value.as_u64())
        .map(|value| value as u32);

    let region = input.get("region").map(parse_region_bbox).transpose()?;

    read_image_with_envelope(
        PathBuf::from(path).as_path(),
        ReadImageOptions {
            max_file_bytes,
            max_pixels,
            include_metadata,
            region,
            max_region_dimension,
            include_region_image,
        },
    )
}

fn parse_region_bbox(value: &serde_json::Value) -> Result<RegionBBox, ProbeError> {
    let x = value
        .get("x")
        .and_then(|entry| entry.as_u64())
        .ok_or_else(|| ProbeError::invalid_params("region.x is required"))?;
    let y = value
        .get("y")
        .and_then(|entry| entry.as_u64())
        .ok_or_else(|| ProbeError::invalid_params("region.y is required"))?;
    let width = value
        .get("width")
        .and_then(|entry| entry.as_u64())
        .ok_or_else(|| ProbeError::invalid_params("region.width is required"))?;
    let height = value
        .get("height")
        .and_then(|entry| entry.as_u64())
        .ok_or_else(|| ProbeError::invalid_params("region.height is required"))?;

    Ok(RegionBBox {
        x: x as u32,
        y: y as u32,
        width: width as u32,
        height: height as u32,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    #[test]
    fn read_image_returns_agent_media_twin_with_rust_probe_route() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("sample.png");
        let img = image::RgbaImage::from_pixel(32, 16, Rgba([1, 2, 3, 255]));
        img.save(&path).expect("save");

        let twin = read_image(
            &path,
            ReadImageOptions {
                include_metadata: false,
                ..ReadImageOptions::default()
            },
        )
        .expect("read");

        assert_eq!(twin.mime, "image/png");
        assert_eq!(twin.dimensions.width, 32);
        assert_eq!(twin.dimensions.height, 16);
        assert!(twin
            .trust_warnings
            .iter()
            .any(|warning| warning.contains(crate::DECODE_ROUTE)));
    }

    #[test]
    fn read_image_attaches_region_evidence_when_requested() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("region.png");
        let img = image::RgbaImage::from_pixel(32, 16, Rgba([4, 5, 6, 255]));
        img.save(&path).expect("save");

        let twin = read_image(
            &path,
            ReadImageOptions {
                include_metadata: false,
                region: Some(RegionBBox {
                    x: 4,
                    y: 2,
                    width: 10,
                    height: 6,
                }),
                ..ReadImageOptions::default()
            },
        )
        .expect("read");

        let evidence = twin.region_evidence.expect("region evidence");
        assert_eq!(evidence.route, crate::CROP_ROUTE);
        assert_eq!(evidence.dimensions.width, 10);
        assert_eq!(evidence.dimensions.height, 6);
    }
}