# SOTA Family Roadmap

Status: adoption plan
Owner: Image Reader MCP
Scope: repo-local future plan and its role in the SylphxAI MCP family
Decision record: `docs/adr/ADR-3-mcp-family-sota-roadmap.md`

## Family Role

Image Reader MCP is the deterministic image evidence engine for the Reader
family. It extracts measurable facts from images: dimensions, format, metadata,
orientation, OCR text, regions, crops, hashes, and trust warnings.

It should keep "read" separate from open-ended visual interpretation. Optional
vision providers may enrich evidence, but the default product is local,
measurable, and provenance-first.

## Family Fit

| Project | Relationship |
| --- | --- |
| Smart Reader MCP | Routes detected image files to `read_image` and normalizes evidence into the family envelope. |
| PDF Reader MCP | Shares bbox, OCR, crop, metadata, trust warning, and provider-route concepts. |
| Video Reader MCP | Shares frame/image crop evidence and OCR-over-image conventions. |
| Architecture Reader MCP | Can use image evidence for repo-adjacent diagrams, screenshots, and visual design artifacts. |
| Consultant MCP | Uses image evidence as source material when reviewing designs or visual claims. |

## SOTA End State

Image Reader MCP should become the default local image inspection tool for
agents. It must tell agents what is directly measured, what is inferred, what is
redacted, what is uncertain, and how to inspect the source region again.

## Runtime Direction

Rust should own decode, metadata parsing, hashing, resizing, crop extraction,
color/profile inspection, decompression limits, batch operations, and MCP
serving through `modelcontextprotocol/rust-sdk` / `rmcp`.

TypeScript can remain only for generated clients, compatibility wrappers, and
package-transition tests. It is not the target MCP adapter runtime.

WASM is appropriate for sandboxed image transforms only when host capabilities
and performance are explicit.

## Roadmap

### Phase 0: Evidence Contract

- Freeze `read_image` output shape.
- Add examples for metadata-only, OCR, crop, malformed, oversized, and
  privacy-sensitive images.
- Add source hash, pixel region, OCR box, confidence, route, and warning fields.
- Document the read-vs-interpret boundary.

### Phase 1: Rust Image Core

- Implement native image probe, hash, EXIF, orientation, resize, thumbnail, and
  crop primitives.
- Add Rust MCP handlers for `read_image` and follow-up crop/region operations.
- Add decompression, malformed-file, and oversized-input tests.
- Add golden fixtures for deterministic metadata and crop output.

### Phase 2: OCR And Region Evidence

- Add provider-neutral OCR interface.
- Return line, word, and region bounding boxes with confidence and route.
- Add follow-up crop evidence for OCR lines and detected regions.
- Add warnings for low resolution, rotation, handwriting, blur, and language
  uncertainty.

### Phase 3: Agent Media Twin

- Add image-level media twin envelope with privacy policy, redaction trace,
  detected regions, thumbnails, and cache metadata.
- Add optional provider enrichment with strict route disclosure.
- Add batch mode for image directories and screenshot sets.

### Phase 4: Native Distribution

- Publish platform-specific optional binary packages for the Rust MCP server.
- Add `doctor` diagnostics for native engine, OCR provider, and permission
  issues.
- Publish benchmark fixtures for probe, OCR, crop, and batch operations.

## Star And Adoption Strategy

The README should lead with a simple promise: agents can cite image facts
without guessing. Star growth comes from instant OCR/metadata demos, privacy
defaults, safe local processing, and examples that show exact bounding boxes and
follow-up crop evidence.

## Validation Gates

- Metadata output is deterministic.
- GPS and sensitive metadata redaction are tested.
- OCR claims include confidence and bounding boxes.
- Large or malicious images fail safely.
- Native install succeeds across supported platforms without network
  postinstall binary downloads.
