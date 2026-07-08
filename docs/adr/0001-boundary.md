# ADR-0001: Image Reader MCP Boundary

**Status:** Accepted  
**Date:** 2026-07-08  
**Project:** image-reader-mcp

## Context

Dispatch integration is defined in
[smart-reader-mcp ADR-0002](https://github.com/SylphxAI/smart-reader-mcp/blob/main/docs/adr/0002-reader-portfolio-architecture.md).
This repo does not own PDF or portfolio-wide docs.

## Decision

`@sylphx/image-reader-mcp` owns the local/open-source MCP contract for: **Evidence-first image reading for AI agents — metadata, OCR text, regions, and citeable evidence without generative LLM.**

Reading uses deterministic extraction (metadata, OCR/ASR adapters, classical signal
processing). Generative LLMs are optional remote providers only, never the default.

## Consequences

- Implement `read_image` with provenance and release gates before v0.1.0.
- Align provenance fields with smart-reader-mcp response envelope (no separate schema repo).
