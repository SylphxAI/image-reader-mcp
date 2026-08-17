# Evidence contract — Iris

No `evidence_first` tool. Family envelope v1: skills `instrument-evidence-envelope.schema.json`.

Locators: pixel bboxes, regions, source path/hash, OCR confidence warnings, gaps for missing OCR packs.
Optional L2 semantics are `scored_non_locator` and never override OCR/geometry.

## Implemented family wire fields (v1)

Every tool result includes:

- `envelope_version: "1"`
- `status`, `tool`, `product`, `product_version`
- `route` as `{ engine, path? }`
- `warnings` and `gaps` arrays (may be empty)
- domain payload (often also as top-level twin/results/answer for compatibility)

Schema: `SylphxAI/skills` `schemas/instrument-evidence-envelope.schema.json`.

## Failure recovery

The Rust MCP surface fails closed before emitting partial evidence. JSON-RPC
errors include `data.status="error"`, a stable `data.code`, and a truthful
`data.next_action` so a consumer can correct the path, region, or documented
request fields and retry. An invalid image never becomes an `ok` twin with
invented content.
