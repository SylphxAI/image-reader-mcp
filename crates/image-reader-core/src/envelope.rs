use std::path::Path;

use serde::Serialize;
use serde_json::Value;

use crate::{AgentMediaTwin, DECODE_ROUTE, ENGINE_NAME, READ_IMAGE_ROUTE};

pub const READER_EVIDENCE_CONTRACT_VERSION: &str = "reader-evidence-v1";
pub const PACKAGE_NAME: &str = "@sylphx/image-reader-mcp";
pub const TOOL_NAME: &str = "read_image";
pub const READER_CONTRACT_VERSION: &str = "0.1.0";

#[allow(non_snake_case)]
#[derive(Debug, Clone, Serialize)]
pub struct AgentEvidenceEnvelope {
    pub subject: String,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sourceHash: Option<String>,
    pub freshness: Freshness,
    pub locator: Locator,
    pub route: RouteInfo,
    pub confidence: &'static str,
    pub warnings: Vec<String>,
    pub nextActions: Vec<String>,
    pub delegation: DelegationBlock,
    pub routing: ReadImageRouting,
    pub result: Value,
}

#[allow(non_snake_case)]
#[derive(Debug, Clone, Serialize)]
pub struct Freshness {
    pub indexedAt: String,
    pub stale: bool,
}

#[allow(non_snake_case)]
#[derive(Debug, Clone, Serialize)]
pub struct Locator {
    pub path: String,
    pub detectedFormat: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RouteInfo {
    pub sniff: String,
    pub delegation: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DelegationBlock {
    pub contract_version: String,
    pub source_path: String,
    pub detected_format: String,
    pub delegated_tool: String,
    pub reader_package: String,
    pub reader_contract_version: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReadImageRouting {
    pub contract_version: String,
    pub extract_route: String,
    pub decode_route: String,
    pub launch_source: String,
    pub reader_package: String,
    pub engine: String,
}

pub struct EnvelopeInput<'a> {
    pub source_path: &'a Path,
    pub detected_format: String,
    pub source_hash: Option<String>,
    pub decode_route: String,
    pub warnings: Vec<String>,
    pub twin: AgentMediaTwin,
}

pub fn build_read_image_envelope(input: EnvelopeInput<'_>) -> AgentEvidenceEnvelope {
    let source = input.source_path.display().to_string();
    let twin_value =
        serde_json::to_value(&input.twin).unwrap_or_else(|_| Value::Object(Default::default()));

    AgentEvidenceEnvelope {
        subject: source.clone(),
        source: source.clone(),
        sourceHash: input.source_hash,
        freshness: Freshness {
            indexedAt: now_iso(),
            stale: false,
        },
        locator: Locator {
            path: source,
            detectedFormat: input.detected_format,
        },
        route: RouteInfo {
            sniff: DECODE_ROUTE.to_string(),
            delegation: TOOL_NAME.to_string(),
        },
        confidence: "deterministic",
        warnings: input.warnings,
        nextActions: vec![
            "Re-run read_image after file changes to refresh sourceHash.".to_string(),
            "Use crop_region for citeable pixel-region evidence.".to_string(),
        ],
        delegation: DelegationBlock {
            contract_version: READER_EVIDENCE_CONTRACT_VERSION.to_string(),
            source_path: input.source_path.display().to_string(),
            detected_format: input.twin.mime.clone(),
            delegated_tool: TOOL_NAME.to_string(),
            reader_package: PACKAGE_NAME.to_string(),
            reader_contract_version: READER_CONTRACT_VERSION.to_string(),
        },
        routing: ReadImageRouting {
            contract_version: READER_EVIDENCE_CONTRACT_VERSION.to_string(),
            extract_route: READ_IMAGE_ROUTE.to_string(),
            decode_route: input.decode_route,
            launch_source: "local".to_string(),
            reader_package: PACKAGE_NAME.to_string(),
            engine: ENGINE_NAME.to_string(),
        },
        result: twin_value,
    }
}

fn now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}Z", elapsed.as_secs())
}