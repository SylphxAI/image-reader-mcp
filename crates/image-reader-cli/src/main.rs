use image_reader_core::{
    crop_region, probe_image, ProbeErrorCode, RegionBBox, ENGINE_NAME, ENGINE_VERSION,
};
use serde::Deserialize;
use std::io::{self, Read};
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
struct Request {
    tool: String,
    input: serde_json::Value,
}

#[derive(Debug, serde::Serialize)]
struct ProbeSuccessEnvelope {
    status: &'static str,
    engine: &'static str,
    version: &'static str,
    probe: image_reader_core::ImageProbe,
}

#[derive(Debug, serde::Serialize)]
struct CropSuccessEnvelope {
    status: &'static str,
    engine: &'static str,
    version: &'static str,
    region_evidence: image_reader_core::RegionEvidence,
}

#[derive(Debug, serde::Serialize)]
struct ErrorEnvelope {
    status: &'static str,
    code: String,
    message: String,
    next_action: String,
}

fn policy_code(code: ProbeErrorCode) -> &'static str {
    match code {
        ProbeErrorCode::InvalidParams => "INVALID_PARAMS",
        ProbeErrorCode::InvalidRequest => "INVALID_REQUEST",
    }
}

fn handle_image_probe(input: &serde_json::Value) -> Result<ProbeSuccessEnvelope, ErrorEnvelope> {
    let path = input
        .get("path")
        .and_then(|value| value.as_str())
        .ok_or_else(|| ErrorEnvelope {
            status: "error",
            code: "INVALID_PARAMS".into(),
            message: "path is required".into(),
            next_action: "Pass an absolute or cwd-relative image path.".into(),
        })?;

    let max_file_bytes = input
        .get("max_file_bytes")
        .and_then(|value| value.as_u64())
        .unwrap_or(32 * 1024 * 1024);

    match probe_image(PathBuf::from(path).as_path(), max_file_bytes) {
        Ok(probe) => Ok(ProbeSuccessEnvelope {
            status: "ok",
            engine: ENGINE_NAME,
            version: ENGINE_VERSION,
            probe,
        }),
        Err(error) => Err(ErrorEnvelope {
            status: "error",
            code: policy_code(error.code).into(),
            message: error.message,
            next_action: "Provide a readable image file within configured safety limits.".into(),
        }),
    }
}

fn parse_bbox(input: &serde_json::Value) -> Result<RegionBBox, ErrorEnvelope> {
    let region = input.get("region").ok_or_else(|| ErrorEnvelope {
        status: "error",
        code: "INVALID_PARAMS".into(),
        message: "region is required".into(),
        next_action: "Pass {\"x\":0,\"y\":0,\"width\":10,\"height\":10}.".into(),
    })?;

    let x = region
        .get("x")
        .and_then(|value| value.as_u64())
        .ok_or_else(|| ErrorEnvelope {
            status: "error",
            code: "INVALID_PARAMS".into(),
            message: "region.x is required".into(),
            next_action: "Provide a non-negative integer x offset.".into(),
        })?;

    let y = region
        .get("y")
        .and_then(|value| value.as_u64())
        .ok_or_else(|| ErrorEnvelope {
            status: "error",
            code: "INVALID_PARAMS".into(),
            message: "region.y is required".into(),
            next_action: "Provide a non-negative integer y offset.".into(),
        })?;

    let width = region
        .get("width")
        .and_then(|value| value.as_u64())
        .ok_or_else(|| ErrorEnvelope {
            status: "error",
            code: "INVALID_PARAMS".into(),
            message: "region.width is required".into(),
            next_action: "Provide a positive integer width.".into(),
        })?;

    let height = region
        .get("height")
        .and_then(|value| value.as_u64())
        .ok_or_else(|| ErrorEnvelope {
            status: "error",
            code: "INVALID_PARAMS".into(),
            message: "region.height is required".into(),
            next_action: "Provide a positive integer height.".into(),
        })?;

    Ok(RegionBBox {
        x: x as u32,
        y: y as u32,
        width: width as u32,
        height: height as u32,
    })
}

fn handle_crop_region(input: &serde_json::Value) -> Result<CropSuccessEnvelope, ErrorEnvelope> {
    let path = input
        .get("path")
        .and_then(|value| value.as_str())
        .ok_or_else(|| ErrorEnvelope {
            status: "error",
            code: "INVALID_PARAMS".into(),
            message: "path is required".into(),
            next_action: "Pass an absolute or cwd-relative image path.".into(),
        })?;

    let max_file_bytes = input
        .get("max_file_bytes")
        .and_then(|value| value.as_u64())
        .unwrap_or(32 * 1024 * 1024);

    let max_pixels = input
        .get("max_pixels")
        .and_then(|value| value.as_u64())
        .unwrap_or(64 * 1024 * 1024);

    let max_dimension = input
        .get("max_region_dimension")
        .and_then(|value| value.as_u64())
        .map(|value| value as u32);

    let include_image_base64 = input
        .get("include_region_image")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);

    let bbox = parse_bbox(input)?;

    match crop_region(
        PathBuf::from(path).as_path(),
        max_file_bytes,
        max_pixels,
        bbox,
        max_dimension,
        include_image_base64,
    ) {
        Ok(region_evidence) => Ok(CropSuccessEnvelope {
            status: "ok",
            engine: ENGINE_NAME,
            version: ENGINE_VERSION,
            region_evidence,
        }),
        Err(error) => Err(ErrorEnvelope {
            status: "error",
            code: policy_code(error.code).into(),
            message: error.message,
            next_action: "Provide a readable region within image bounds and safety limits.".into(),
        }),
    }
}

fn main() {
    let mut payload = String::new();
    if io::stdin().read_to_string(&mut payload).is_err() {
        eprintln!("Failed to read stdin");
        std::process::exit(1);
    }

    let request: Request = match serde_json::from_str(&payload) {
        Ok(value) => value,
        Err(error) => {
            let envelope = ErrorEnvelope {
                status: "error",
                code: "INVALID_REQUEST".into(),
                message: format!("Invalid JSON request: {error}"),
                next_action: "Send {\"tool\":\"image_probe\",\"input\":{...}} on stdin.".into(),
            };
            println!("{}", serde_json::to_string(&envelope).expect("serialize"));
            std::process::exit(1);
        }
    };

    let output = match request.tool.as_str() {
        "image_probe" => match handle_image_probe(&request.input) {
            Ok(success) => serde_json::to_string(&success).expect("serialize"),
            Err(error) => serde_json::to_string(&error).expect("serialize"),
        },
        "crop_region" => match handle_crop_region(&request.input) {
            Ok(success) => serde_json::to_string(&success).expect("serialize"),
            Err(error) => serde_json::to_string(&error).expect("serialize"),
        },
        other => serde_json::to_string(&ErrorEnvelope {
            status: "error",
            code: "UNSUPPORTED_TOOL".into(),
            message: format!("Unsupported tool: {other}"),
            next_action: "Use image_probe or crop_region.".into(),
        })
        .expect("serialize"),
    };

    println!("{output}");
}