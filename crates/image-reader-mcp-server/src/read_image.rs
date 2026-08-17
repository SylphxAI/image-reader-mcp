use image_reader_core::read_image::{DEFAULT_MAX_FILE_BYTES, DEFAULT_MAX_PIXELS};
use image_reader_core::{
    crop_region as core_crop_region, probe_image, read_image_from_value, ProbeErrorCode, RegionBBox,
};
use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::ffi::{OsStr, OsString};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use crate::SERVER_VERSION;

pub const READ_IMAGE_ROUTE: &str = "rust-read-image-v1";
pub const IMAGE_PROBE_ROUTE: &str = "rust-image-probe-v1";
pub const CROP_REGION_ROUTE: &str = "rust-crop-region-v1";
pub const OCR_ROUTE: &str = "tesseract_tsv_psm3";

const DEFAULT_OCR_LANGUAGE: &str = "eng";
const OCR_COMMAND_TIMEOUT: Duration = Duration::from_secs(60);
const OCR_HEALTHCHECK_TIMEOUT: Duration = Duration::from_secs(2);
const OCR_MAX_OUTPUT_BYTES: usize = 20 * 1024 * 1024;
const OCR_MAX_ERROR_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct RegionArgs {
    /// Left edge in source pixels.
    pub x: u32,
    /// Top edge in source pixels.
    pub y: u32,
    /// Region width in source pixels.
    pub width: u32,
    /// Region height in source pixels.
    pub height: u32,
}

impl From<RegionArgs> for RegionBBox {
    fn from(region: RegionArgs) -> Self {
        Self {
            x: region.x,
            y: region.y,
            width: region.width,
            height: region.height,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReadImageArgs {
    /// Absolute or current-working-directory-relative local image path.
    pub path: String,
    /// Include EXIF metadata when present. Defaults to true.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_metadata: Option<bool>,
    /// Optional source pixel region to attach as citeable evidence.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub region: Option<RegionArgs>,
    /// Include base64 PNG bytes when region evidence is requested.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_region_image: Option<bool>,
    /// Optional maximum width or height for the rendered region evidence.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_region_dimension: Option<u32>,
    /// Attempt local Tesseract OCR. Missing Tesseract or language packs are reported as unavailable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_ocr: Option<bool>,
    /// Include word-level OCR bounding boxes in addition to line evidence.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_ocr_words: Option<bool>,
    /// Tesseract language codes. Defaults to ["eng"].
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ocr_languages: Option<Vec<String>>,
    /// Drop OCR words below this Tesseract confidence threshold (0-100).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ocr_min_confidence: Option<f64>,
}

impl ReadImageArgs {
    fn into_value(self) -> Result<Value, rmcp::ErrorData> {
        serde_json::to_value(self).map_err(|error| {
            invalid_params_error(format!(
                "failed to serialize read_image parameters: {error}"
            ))
        })
    }
}

#[derive(Debug, Clone, Serialize)]
struct OcrBBox {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone)]
struct OcrWordRecord {
    text: String,
    bbox: OcrBBox,
    confidence: f64,
}

#[derive(Debug, Clone, Serialize)]
struct OcrWord {
    text: String,
    bbox: OcrBBox,
    confidence: f64,
}

#[derive(Debug, Clone, Serialize)]
struct OcrLine {
    text: String,
    bbox: OcrBBox,
    #[serde(skip_serializing_if = "Option::is_none")]
    confidence: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
struct OcrResult {
    available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    skipped_reason: Option<String>,
    route: String,
    languages: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    languages_warning: Option<String>,
    line_count: usize,
    dropped_low_confidence: usize,
    lines: Vec<OcrLine>,
    #[serde(skip_serializing_if = "Option::is_none")]
    words: Option<Vec<OcrWord>>,
}

#[derive(Debug)]
enum OcrError {
    InvalidParams(String),
}

#[derive(Debug)]
struct CommandResult {
    status: ExitStatus,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    stdout_truncated: bool,
}

fn read_capped(mut reader: impl Read, cap: usize) -> std::io::Result<(Vec<u8>, bool)> {
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 8192];
    let mut truncated = false;
    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        if bytes.len() < cap {
            let remaining = cap - bytes.len();
            let take = remaining.min(read);
            bytes.extend_from_slice(&buffer[..take]);
            if take < read {
                truncated = true;
            }
        } else {
            truncated = true;
        }
    }
    Ok((bytes, truncated))
}

fn run_command(
    program: &OsStr,
    args: &[OsString],
    timeout: Duration,
    stdout_cap: usize,
    stderr_cap: usize,
) -> Result<CommandResult, String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("failed to start tesseract: {error}"))?;
    let stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err("tesseract stdout pipe was unavailable".to_string());
        }
    };
    let stderr = match child.stderr.take() {
        Some(stderr) => stderr,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err("tesseract stderr pipe was unavailable".to_string());
        }
    };
    let stdout_reader = thread::spawn(move || read_capped(stdout, stdout_cap));
    let stderr_reader = thread::spawn(move || read_capped(stderr, stderr_cap));

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() >= timeout => {
                let _ = child.kill();
                child.wait().map_err(|error| {
                    format!("tesseract timed out and could not be reaped: {error}")
                })?;
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(format!(
                    "tesseract timed out after {} seconds",
                    timeout.as_secs()
                ));
            }
            Ok(None) => thread::sleep(Duration::from_millis(25)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(format!("failed waiting for tesseract: {error}"));
            }
        }
    };

    let stdout = stdout_reader
        .join()
        .map_err(|_| "tesseract stdout reader panicked".to_string())?
        .map_err(|error| format!("failed reading tesseract stdout: {error}"))?;
    let stderr = stderr_reader
        .join()
        .map_err(|_| "tesseract stderr reader panicked".to_string())?
        .map_err(|error| format!("failed reading tesseract stderr: {error}"))?;

    Ok(CommandResult {
        status,
        stdout: stdout.0,
        stderr: stderr.0,
        stdout_truncated: stdout.1,
    })
}

fn unavailable(languages: Vec<String>, reason: impl Into<String>) -> OcrResult {
    OcrResult {
        available: false,
        skipped_reason: Some(reason.into()),
        route: OCR_ROUTE.to_string(),
        languages,
        languages_warning: None,
        line_count: 0,
        dropped_low_confidence: 0,
        lines: Vec::new(),
        words: None,
    }
}

fn parse_tsv(
    raw: &str,
    min_confidence: f64,
    include_words: bool,
) -> (Vec<OcrLine>, Option<Vec<OcrWord>>, usize) {
    let mut groups: BTreeMap<(u32, u32, u32), Vec<OcrWordRecord>> = BTreeMap::new();
    let mut dropped = 0_usize;

    for row in raw.lines().skip(1) {
        let columns: Vec<_> = row.splitn(12, '\t').collect();
        if columns.len() < 12 || columns[0].parse::<u32>().ok() != Some(5) {
            continue;
        }
        let block = match columns[2].parse::<u32>() {
            Ok(value) => value,
            Err(_) => continue,
        };
        let paragraph = match columns[3].parse::<u32>() {
            Ok(value) => value,
            Err(_) => continue,
        };
        let line = match columns[4].parse::<u32>() {
            Ok(value) => value,
            Err(_) => continue,
        };
        let parse_coordinate = |value: &str| value.parse::<i64>().ok().filter(|value| *value >= 0);
        let left = match parse_coordinate(columns[6]).and_then(|value| u32::try_from(value).ok()) {
            Some(value) => value,
            None => continue,
        };
        let top = match parse_coordinate(columns[7]).and_then(|value| u32::try_from(value).ok()) {
            Some(value) => value,
            None => continue,
        };
        let width = match parse_coordinate(columns[8]).and_then(|value| u32::try_from(value).ok()) {
            Some(value) if value > 0 => value,
            _ => continue,
        };
        let height = match parse_coordinate(columns[9]).and_then(|value| u32::try_from(value).ok())
        {
            Some(value) if value > 0 => value,
            _ => continue,
        };
        let text = columns[11].trim();
        if text.is_empty() {
            continue;
        }
        let confidence = columns[10].parse::<f64>().unwrap_or(-1.0);
        if confidence < min_confidence {
            dropped += 1;
            continue;
        }
        groups
            .entry((block, paragraph, line))
            .or_default()
            .push(OcrWordRecord {
                text: text.to_string(),
                bbox: OcrBBox {
                    x: left,
                    y: top,
                    width,
                    height,
                },
                confidence,
            });
    }

    let mut words = include_words.then(Vec::new);
    let mut lines = Vec::new();
    for (_, mut group) in groups {
        group.sort_by_key(|word| (word.bbox.y, word.bbox.x));
        let left = group.iter().map(|word| word.bbox.x).min().unwrap_or(0);
        let top = group.iter().map(|word| word.bbox.y).min().unwrap_or(0);
        let right = group
            .iter()
            .map(|word| word.bbox.x.saturating_add(word.bbox.width))
            .max()
            .unwrap_or(left);
        let bottom = group
            .iter()
            .map(|word| word.bbox.y.saturating_add(word.bbox.height))
            .max()
            .unwrap_or(top);
        let confidence = (!group.is_empty())
            .then(|| group.iter().map(|word| word.confidence).sum::<f64>() / group.len() as f64);
        let text = group
            .iter()
            .map(|word| word.text.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        if let Some(words_out) = words.as_mut() {
            words_out.extend(group.iter().cloned().map(|word| OcrWord {
                text: word.text,
                bbox: word.bbox,
                confidence: word.confidence,
            }));
        }
        lines.push(OcrLine {
            text,
            bbox: OcrBBox {
                x: left,
                y: top,
                width: right.saturating_sub(left),
                height: bottom.saturating_sub(top),
            },
            confidence,
        });
    }
    lines.sort_by_key(|line| (line.bbox.y, line.bbox.x));
    if let Some(words_out) = words.as_mut() {
        words_out.sort_by_key(|word| (word.bbox.y, word.bbox.x));
    }
    (lines, words, dropped)
}

fn valid_language(language: &str) -> bool {
    !language.is_empty()
        && language
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn run_tesseract(path: &Path, args: &ReadImageArgs) -> Result<OcrResult, OcrError> {
    let languages = args
        .ocr_languages
        .clone()
        .unwrap_or_else(|| vec![DEFAULT_OCR_LANGUAGE.to_string()]);
    if languages.is_empty() || languages.iter().any(|language| !valid_language(language)) {
        return Err(OcrError::InvalidParams(
            "ocr_languages must contain one or more safe Tesseract language codes".to_string(),
        ));
    }
    let min_confidence = args.ocr_min_confidence.unwrap_or(0.0);
    if !min_confidence.is_finite() || !(0.0..=100.0).contains(&min_confidence) {
        return Err(OcrError::InvalidParams(
            "ocr_min_confidence must be between 0 and 100".to_string(),
        ));
    }

    let version = match run_command(
        OsStr::new("tesseract"),
        &[OsString::from("--version")],
        OCR_HEALTHCHECK_TIMEOUT,
        OCR_MAX_ERROR_BYTES,
        OCR_MAX_ERROR_BYTES,
    ) {
        Ok(version) => version,
        Err(reason) => return Ok(unavailable(languages, reason)),
    };
    if !version.status.success() {
        let reason = String::from_utf8_lossy(&version.stderr).trim().to_string();
        return Ok(unavailable(
            languages,
            if reason.is_empty() {
                format!("tesseract exited with status {}", version.status)
            } else {
                reason
            },
        ));
    }

    let language_arg = languages.join("+");
    let language_list = run_command(
        OsStr::new("tesseract"),
        &[OsString::from("--list-langs")],
        OCR_HEALTHCHECK_TIMEOUT,
        OCR_MAX_ERROR_BYTES,
        OCR_MAX_ERROR_BYTES,
    );
    let mut languages_warning = None;
    if let Ok(result) = language_list {
        if result.status.success() {
            let installed = String::from_utf8_lossy(&result.stdout)
                .lines()
                .map(str::trim)
                .filter(|line| !line.is_empty() && !line.to_ascii_lowercase().contains("list of"))
                .map(str::to_string)
                .collect::<Vec<_>>();
            let missing = languages
                .iter()
                .filter(|language| !installed.iter().any(|installed| installed == *language))
                .cloned()
                .collect::<Vec<_>>();
            if !missing.is_empty() {
                languages_warning = Some(format!(
                    "Requested OCR language(s) not listed by tesseract: {}. Installed: {}.",
                    missing.join(", "),
                    if installed.is_empty() {
                        "(none)".to_string()
                    } else {
                        installed.join(", ")
                    }
                ));
            }
        }
    }

    let command_args = vec![
        path.as_os_str().to_os_string(),
        OsString::from("stdout"),
        OsString::from("-l"),
        OsString::from(language_arg),
        OsString::from("tsv"),
        OsString::from("--psm"),
        OsString::from("3"),
    ];
    let result = match run_command(
        OsStr::new("tesseract"),
        &command_args,
        OCR_COMMAND_TIMEOUT,
        OCR_MAX_OUTPUT_BYTES,
        OCR_MAX_ERROR_BYTES,
    ) {
        Ok(result) => result,
        Err(reason) => return Ok(unavailable(languages, reason)),
    };
    if !result.status.success() {
        let reason = String::from_utf8_lossy(&result.stderr).trim().to_string();
        return Ok(unavailable(
            languages,
            if reason.is_empty() {
                format!("tesseract exited with status {}", result.status)
            } else {
                reason
            },
        ));
    }
    if result.stdout_truncated {
        return Ok(unavailable(
            languages,
            format!(
                "tesseract output exceeded the {} MiB safety cap",
                OCR_MAX_OUTPUT_BYTES / (1024 * 1024)
            ),
        ));
    }
    let (lines, words, dropped_low_confidence) = parse_tsv(
        &String::from_utf8_lossy(&result.stdout),
        min_confidence,
        args.include_ocr_words.unwrap_or(false),
    );
    Ok(OcrResult {
        available: true,
        skipped_reason: None,
        route: OCR_ROUTE.to_string(),
        languages,
        languages_warning,
        line_count: lines.len(),
        dropped_low_confidence,
        lines,
        words,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct ImageProbeArgs {
    /// Absolute or current-working-directory-relative local image path.
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct CropRegionArgs {
    /// Absolute or current-working-directory-relative local image path.
    pub path: String,
    /// Source pixel region to crop.
    pub region: RegionArgs,
    /// Optional maximum width or height for the rendered region evidence.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_region_dimension: Option<u32>,
    /// Include base64 PNG bytes of the cropped region.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_region_image: Option<bool>,
}

fn with_family_envelope(tool: &str, route_path: &str, mut body: Value) -> Value {
    let obj = body.as_object_mut().expect("structured body object");
    let warnings = obj
        .get("envelope")
        .and_then(|e| e.get("warnings"))
        .cloned()
        .unwrap_or_else(|| json!([]));
    let gaps = obj.get("gaps").cloned().unwrap_or_else(|| json!([]));
    let status = obj
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("ok")
        .to_string();
    let path = obj
        .get("envelope")
        .and_then(|e| {
            e.get("source")
                .or_else(|| e.get("source_path"))
                .or_else(|| e.get("locator").and_then(|l| l.get("path")))
        })
        .cloned();
    let source_hash = obj
        .get("envelope")
        .and_then(|e| e.get("sourceHash").or_else(|| e.get("source_hash")))
        .cloned();

    if let Some(envelope) = obj.get_mut("envelope").and_then(Value::as_object_mut) {
        envelope.insert("product_version".into(), json!(SERVER_VERSION));
    }

    obj.insert("envelope_version".into(), json!("1"));
    obj.insert("status".into(), json!(status));
    obj.insert("tool".into(), json!(tool));
    obj.insert("product".into(), json!("iris"));
    obj.insert("product_version".into(), json!(SERVER_VERSION));
    obj.insert(
        "route".into(),
        json!({ "engine": "rust-core", "path": route_path }),
    );
    // Preserve string route for legacy tests under domain_route if needed.
    obj.insert("domain_route".into(), json!(route_path));
    obj.entry("warnings".to_string()).or_insert(warnings);
    obj.entry("gaps".to_string()).or_insert(gaps);
    obj.entry("confidence".to_string())
        .or_insert(json!({ "kind": "deterministic", "notes": [] }));
    if let Some(p) = path {
        obj.entry("source".to_string())
            .or_insert(json!({ "path": p }));
    }
    if let Some(hash) = source_hash {
        obj.entry("sourceHash".to_string()).or_insert(hash);
    }
    if let Some(payload) = obj
        .get("twin")
        .cloned()
        .or_else(|| obj.get("probe").cloned())
        .or_else(|| obj.get("region_evidence").cloned())
    {
        obj.entry("payload".to_string()).or_insert(payload);
    }
    body
}

fn recovery_data(code: &'static str, next_action: &'static str) -> Value {
    json!({
        "status": "error",
        "product": "iris",
        "code": code,
        "next_action": next_action,
    })
}

fn invalid_params_error(message: impl Into<String>) -> rmcp::ErrorData {
    rmcp::ErrorData::invalid_params(
        message.into(),
        Some(recovery_data(
            "INVALID_PARAMS",
            "Correct the documented request fields and retry.",
        )),
    )
}

fn map_probe_error(error: image_reader_core::ProbeError) -> rmcp::ErrorData {
    let (code, next_action) = match &error.code {
        ProbeErrorCode::InvalidParams => (
            "INVALID_PARAMS",
            "Correct the documented request fields and retry.",
        ),
        ProbeErrorCode::InvalidRequest => (
            "INVALID_REQUEST",
            "Provide a readable local image within the fixed safety limits and retry.",
        ),
    };
    let data = Some(recovery_data(code, next_action));
    match error.code {
        ProbeErrorCode::InvalidParams => rmcp::ErrorData::invalid_params(error.message, data),
        ProbeErrorCode::InvalidRequest => rmcp::ErrorData::invalid_request(error.message, data),
    }
}

pub fn read_image(args: Value) -> Result<CallToolResult, rmcp::ErrorData> {
    let typed = serde_json::from_value::<ReadImageArgs>(args.clone())
        .map_err(|error| invalid_params_error(format!("invalid read_image parameters: {error}")))?;
    let success = read_image_from_value(&args).map_err(map_probe_error)?;

    let mut twin = serde_json::to_value(&success.twin).expect("AgentMediaTwin serializes");
    let mut envelope =
        serde_json::to_value(&success.envelope).expect("evidence envelope serializes");
    let mut warnings = success.envelope.warnings.clone();
    let mut gaps: Vec<String> = Vec::new();
    if typed.include_ocr.unwrap_or(false) {
        let ocr = run_tesseract(Path::new(&typed.path), &typed).map_err(|error| match error {
            OcrError::InvalidParams(message) => invalid_params_error(message),
        })?;
        if !ocr.available {
            if let Some(reason) = ocr.skipped_reason.as_deref() {
                warnings.push(format!("OCR unavailable: {reason}"));
            }
            gaps.push("ocr_unavailable".to_string());
        }
        twin.as_object_mut()
            .expect("AgentMediaTwin JSON object")
            .insert(
                "ocr".to_string(),
                serde_json::to_value(ocr).expect("OCR serializes"),
            );
        if let Some(envelope_object) = envelope.as_object_mut() {
            envelope_object.insert("result".to_string(), twin.clone());
            envelope_object.insert("warnings".to_string(), json!(warnings));
            envelope_object.insert("gaps".to_string(), json!(gaps));
        }
    }

    let structured = with_family_envelope(
        "read_image",
        READ_IMAGE_ROUTE,
        json!({
            "tool": "read_image",
            "route": READ_IMAGE_ROUTE,
            "engine": image_reader_core::ENGINE_NAME,
            "twin": twin,
            "envelope": envelope,
            "status": "ok",
            "warnings": warnings,
            "gaps": gaps,
        }),
    );

    Ok(CallToolResult::structured(structured))
}

pub(crate) fn read_image_typed(args: ReadImageArgs) -> Result<CallToolResult, rmcp::ErrorData> {
    read_image(args.into_value()?)
}

pub(crate) fn image_probe(args: ImageProbeArgs) -> Result<CallToolResult, rmcp::ErrorData> {
    let path = PathBuf::from(&args.path);
    let probe = probe_image(&path, DEFAULT_MAX_FILE_BYTES).map_err(map_probe_error)?;
    let source_hash = probe.source_hash.clone();
    let structured = with_family_envelope(
        "image_probe",
        IMAGE_PROBE_ROUTE,
        json!({
            "status": "ok",
            "probe": probe,
            "envelope": {
                "source": args.path,
                "sourceHash": source_hash,
                "warnings": [],
                "gaps": [],
            },
        }),
    );
    Ok(CallToolResult::structured(structured))
}

pub(crate) fn crop_region_tool(args: CropRegionArgs) -> Result<CallToolResult, rmcp::ErrorData> {
    let path = PathBuf::from(&args.path);
    // Probe once for source hash/provenance before the crop operation. The core crop route
    // intentionally reports the derived region hash; the family envelope carries source hash.
    let probe = probe_image(&path, DEFAULT_MAX_FILE_BYTES).map_err(map_probe_error)?;
    let source_hash = probe.source_hash.clone();
    let evidence = core_crop_region(
        &path,
        DEFAULT_MAX_FILE_BYTES,
        DEFAULT_MAX_PIXELS,
        args.region.into(),
        args.max_region_dimension,
        args.include_region_image.unwrap_or(false),
    )
    .map_err(map_probe_error)?;
    let warnings = vec![
        format!(
            "Decode route: {} (source hash {}…).",
            probe.route,
            &source_hash[..12.min(source_hash.len())]
        ),
        format!(
            "Region evidence: {} (hash {}…).",
            evidence.route,
            &evidence.region_hash[..12.min(evidence.region_hash.len())]
        ),
    ];
    let structured = with_family_envelope(
        "crop_region",
        CROP_REGION_ROUTE,
        json!({
            "status": "ok",
            "region_evidence": evidence,
            "envelope": {
                "source": args.path,
                "sourceHash": source_hash,
                "warnings": warnings,
                "gaps": [],
            },
        }),
    );
    Ok(CallToolResult::structured(structured))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn reads_fixture_through_rust_core_route() {
        let fixture =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../test/fixtures/sample.png");
        if !fixture.is_file() {
            return;
        }

        let result = read_image(serde_json::json!({
            "path": fixture,
            "include_metadata": false
        }))
        .expect("read_image");

        let structured = result.structured_content.expect("structured");
        assert_eq!(
            structured.get("domain_route").and_then(Value::as_str),
            Some(READ_IMAGE_ROUTE)
        );
        assert_eq!(
            structured.get("envelope_version").and_then(Value::as_str),
            Some("1")
        );
        assert_eq!(
            structured.get("product").and_then(Value::as_str),
            Some("iris")
        );
        assert_eq!(
            structured
                .get("envelope")
                .and_then(|value| value.get("product_version"))
                .and_then(Value::as_str),
            Some(SERVER_VERSION)
        );
        assert_eq!(
            structured
                .get("route")
                .and_then(|r| r.get("engine"))
                .and_then(Value::as_str),
            Some("rust-core")
        );
        assert_eq!(
            structured
                .get("twin")
                .and_then(|value| value.get("mime"))
                .and_then(Value::as_str),
            Some("image/png")
        );
    }

    #[test]
    fn direct_read_image_route_rejects_unsupported_flags() {
        let error = read_image(serde_json::json!({
            "path": "/tmp/image.png",
            "include_layout": true,
        }))
        .expect_err("unsupported layout must not be silently ignored");
        assert_eq!(error.code, rmcp::model::ErrorCode::INVALID_PARAMS);
        assert!(error.message.contains("unknown field"));
        assert_eq!(
            error
                .data
                .as_ref()
                .and_then(|data| data.get("status"))
                .and_then(Value::as_str),
            Some("error")
        );
        assert_eq!(
            error
                .data
                .as_ref()
                .and_then(|data| data.get("next_action"))
                .and_then(Value::as_str),
            Some("Correct the documented request fields and retry.")
        );
    }

    #[test]
    fn native_errors_include_truthful_recovery_data() {
        let error = read_image(serde_json::json!({
            "path": "/tmp/iris-missing-image.png",
        }))
        .expect_err("missing image must fail closed");
        assert_eq!(error.code, rmcp::model::ErrorCode::INVALID_REQUEST);
        assert_eq!(
            error
                .data
                .as_ref()
                .and_then(|data| data.get("code"))
                .and_then(Value::as_str),
            Some("INVALID_REQUEST")
        );
        assert_eq!(
            error
                .data
                .as_ref()
                .and_then(|data| data.get("next_action"))
                .and_then(Value::as_str),
            Some("Provide a readable local image within the fixed safety limits and retry.")
        );
    }

    #[test]
    fn parses_tesseract_tsv_into_citeable_lines_and_words() {
        let raw = concat!(
            "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n",
            "5\t1\t1\t1\t1\t1\t10\t20\t30\t10\t95.0\tHello\n",
            "5\t1\t1\t1\t1\t2\t45\t20\t35\t10\t90.0\tworld\n",
        );
        let (lines, words, dropped) = parse_tsv(raw, 0.0, true);
        assert_eq!(dropped, 0);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].text, "Hello world");
        assert_eq!(lines[0].bbox.x, 10);
        assert_eq!(lines[0].bbox.width, 70);
        assert_eq!(lines[0].confidence, Some(92.5));
        assert_eq!(words.expect("word evidence").len(), 2);
    }

    #[test]
    fn parser_drops_words_below_confidence_threshold() {
        let raw = concat!(
            "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n",
            "5\t1\t1\t1\t1\t1\t10\t20\t30\t10\t20.0\tlow\n",
            "5\t1\t1\t1\t1\t2\t45\t20\t35\t10\t90.0\thigh\n",
        );
        let (lines, _, dropped) = parse_tsv(raw, 50.0, false);
        assert_eq!(dropped, 1);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].text, "high");
    }

    #[test]
    fn image_probe_returns_family_provenance_and_decode_route() {
        let fixture =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../test/fixtures/sample.png");
        if !fixture.is_file() {
            return;
        }

        let result = image_probe(ImageProbeArgs {
            path: fixture.display().to_string(),
        })
        .expect("image_probe");
        let structured = result.structured_content.expect("structured");
        assert_eq!(
            structured.get("tool").and_then(Value::as_str),
            Some("image_probe")
        );
        assert_eq!(
            structured.get("envelope_version").and_then(Value::as_str),
            Some("1")
        );
        assert_eq!(
            structured
                .get("probe")
                .and_then(|probe| probe.get("route"))
                .and_then(Value::as_str),
            Some(image_reader_core::DECODE_ROUTE)
        );
        assert!(structured
            .get("sourceHash")
            .and_then(Value::as_str)
            .is_some());
    }

    #[test]
    fn crop_region_returns_family_provenance_and_region_hash() {
        let fixture =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../test/fixtures/sample.png");
        if !fixture.is_file() {
            return;
        }

        let result = crop_region_tool(CropRegionArgs {
            path: fixture.display().to_string(),
            region: RegionArgs {
                x: 4,
                y: 2,
                width: 10,
                height: 6,
            },
            max_region_dimension: None,
            include_region_image: None,
        })
        .expect("crop_region");
        let structured = result.structured_content.expect("structured");
        assert_eq!(
            structured.get("tool").and_then(Value::as_str),
            Some("crop_region")
        );
        assert_eq!(
            structured
                .get("region_evidence")
                .and_then(|evidence| evidence.get("route"))
                .and_then(Value::as_str),
            Some(image_reader_core::CROP_ROUTE)
        );
        assert!(structured
            .get("region_evidence")
            .and_then(|evidence| evidence.get("regionHash"))
            .and_then(Value::as_str)
            .is_some_and(|hash| !hash.is_empty()));
        assert!(structured
            .get("sourceHash")
            .and_then(Value::as_str)
            .is_some());
    }
}
