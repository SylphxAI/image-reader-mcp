# ADR-0001: Image Reader MCP Boundary

**Status:** Accepted  
**Date:** 2026-07-08  
**Project:** image-reader-mcp

## Context

This repository is part of the Sylphx Reader portfolio. Cross-cutting architecture
is defined in [pdf-reader-mcp ADR-0004](https://github.com/SylphxAI/pdf-reader-mcp/blob/main/docs/adr/0004-reader-portfolio-architecture.md).

## Decision

`@sylphx/image-reader-mcp` owns the local/open-source MCP contract for: **Evidence-first image reading for AI agents — metadata, OCR text, regions, and citeable evidence without generative LLM.**

Reading uses deterministic extraction (metadata, OCR/ASR adapters, classical signal
processing). Generative LLMs are optional remote providers only, never the default.

## Consequences

- Implement `read_image` with provenance and release gates before v0.1.0.
- Align provenance fields with smart-reader-mcp response envelope (no separate schema repo).
