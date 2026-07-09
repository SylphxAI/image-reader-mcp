# ADR-3: Adopt Image Reader MCP Family SOTA Roadmap

Date: 2026-07-09  
Status: Proposed in PR #3  
Slug: mcp-family-sota-roadmap

## Context

Image Reader MCP is the image evidence specialist in the SylphxAI Reader
family. It needs a repo-local roadmap that keeps image reading deterministic,
local-first, and provenance-rich while integrating with Smart Reader and sibling
evidence tools.

## Decision

Adopt `docs/roadmap/sota-family-roadmap.md` as the local roadmap for Image
Reader MCP's family role.

Image Reader MCP owns image decode, metadata, OCR, crop, region, privacy, and
trust evidence. It does not own open-ended visual interpretation by default.

## Consequences

- Smart Reader routes images but does not own image evidence semantics.
- Rust is the target for decode, metadata, crop, hash, redaction, and batch hot
  paths.
- Optional OCR or vision providers must expose route, confidence, privacy, and
  warning data.
- Future work must preserve the read-vs-interpret boundary.

## Verification

- Roadmap added at `docs/roadmap/sota-family-roadmap.md`.
- README and PROJECT link to the roadmap.
- Docs-only validation: `git diff --check`.
