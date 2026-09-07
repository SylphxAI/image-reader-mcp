# Image Reader MCP

Evidence-first image reading for AI agents — metadata, OCR text, regions, and citeable evidence without generative LLM.

## Lifecycle

- Lifecycle: `bootstrap`
- Layer: `tooling`
- SOTA family roadmap: [`docs/roadmap/sota-family-roadmap.md`](docs/roadmap/sota-family-roadmap.md)

## Goals

- Local-first MCP package with evidence-first read output and benchmark-gated releases.
- Preserve provenance so agents can cite sources (page, frame, time, bbox).

## Non-Goals

- Hosted auth, billing, storage, tenancy, or customer data retention.
- Default generative LLM vision/language for reading.
