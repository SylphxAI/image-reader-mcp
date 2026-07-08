# Image Reader MCP

Evidence-first image reading for AI agents — metadata, OCR text, regions, and citeable evidence without generative LLM.

## Lifecycle

- Lifecycle: `bootstrap`
- Layer: `tooling`
- Portfolio ADR: [pdf-reader-mcp ADR-0004](https://github.com/SylphxAI/pdf-reader-mcp/blob/main/docs/adr/0004-reader-portfolio-architecture.md)

## Goals

- Local-first MCP package with evidence-first read output and benchmark-gated releases.
- Preserve provenance so agents can cite sources (page, frame, time, bbox).

## Non-Goals

- Hosted auth, billing, storage, tenancy, or customer data retention.
- Default generative LLM vision/language for reading.
