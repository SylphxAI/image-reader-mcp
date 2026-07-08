# Operating Model — image-reader-mcp

**Status:** Bootstrap target  
**Owner:** image-reader-mcp

## Goal

Evidence-first image reading for AI agents — metadata, OCR text, regions, and citeable evidence without generative LLM.

## Non-Goals

- Hosted platform services inside this package.
- Frame-by-frame or whole-image generative LLM understanding as default.

## Acceptance (v0.1.0)

- `read_image` ships with schema, handler, tests, and docs.
- Default path works without remote providers or ML model downloads.
- Release gate JSON artifact passes in CI.
