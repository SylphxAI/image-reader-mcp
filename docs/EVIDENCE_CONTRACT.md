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
