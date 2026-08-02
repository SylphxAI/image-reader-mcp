# ADR-20260802 — Iris L2 local semantics (objects / open-vocab / caption)

## Status

Accepted for execution (2026-08-02)

## Context

Owner research: metadata + OCR alone risk “no real wow.” Modern local-first vision
(Florence-2, Grounding DINO + SAM 2, local VLMs) can detect people/animals/objects
with boxes/masks while remaining offline. Iris must stay Evidence First and
zero-config: L0/L1 facts always work without models; L2 is optional scored evidence.

## Decision

1. **Keep one primary tool** `read_image` (no schema explosion).
2. **Layers**
   - L0 Facts: geometry, mime, hash, metadata, safety (always)
   - L1 Text/Layout: OCR + layout + agent_map (existing)
   - L2 Semantics: `objects[]` + optional caption + optional mask refs (**opt-in / auto**)
3. **Flag:** `include_semantics`: `false` | `true` | `"auto"` (default `false` for zero-surprise).
   - `true` / `"auto"`: try local backends; fail closed with `skipped_reason` if none.
4. **Backends (priority)**
   1. `IRIS_SEMANTICS_URL` — Florence-class / Grounding-DINO+SAM adapter HTTP
   2. Local Ollama vision model with **structured JSON** object list
5. **Authority:** L2 is `authority: "scored_non_locator"` — never overrides OCR/layout
   locators; always carries `route`, `model`, scores, warnings.
6. **Cue composition:** video structural keyframes feed Iris L2; Cue does not own OD.

## Non-goals

- Default cloud vision
- Per-frame video VLM
- Shipping multi-GB weights inside the npm package by default
- New MCP tools for caption/objects/masks separately

## Consequences

- Product wow path exists without poisoning zero-config L0/L1.
- Adapters can plug Florence-2 / SAM2 offline without monorepo.
- Tests use mock HTTP semantics oracle; live Ollama is best-effort.
