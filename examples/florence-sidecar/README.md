# Iris L2 Semantics Sidecar (Florence-class)

Official **reference sidecar** for Iris L2 local semantics. It implements the
`IRIS_SEMANTICS_URL` HTTP contract so `read_image { include_semantics: true }`
returns **open-vocab objects** (people, animals, things) with pixel bboxes —
fully local, no cloud, no per-frame VLM.

```text
Iris (MCP) ──POST──> sidecar ──transformers──> Florence-2 / Grounding-DINO ──> objects[]
```

## Why a sidecar?

Iris itself stays **zero-config and lightweight**: L2 is opt-in
(`include_semantics: true`). The optional local semantics engine lives here so
the main npm package never bundles multi-GB weights.

## Quick start (requires Python + a local model)

```bash
pip install -r requirements.txt        # fastapi, uvicorn, transformers, torch
python -m src.app --model microsoft/Florence-2-large   # or your local HF path
```

In your agent config:

```json
{ "IRIS_SEMANTICS_URL": "http://127.0.0.1:8765" }
```

Then (see Iris read contract):

```json
{ "path": "/abs/photo.jpg", "include_semantics": true, "semantics_prompt": "people and animals" }
```

## Contract

`POST /semantics` with JSON:

```json
{ "path": "/abs/a.png", "mime": "image/png", "purpose": "image_semantics", "prompt": "optional" }
```

Response (validated by Iris client):

```json
{
  "caption": "a person walking a dog",
  "model": "florence2",
  "objects": [
    { "label": "person", "category": "person", "bbox": { "x": 10, "y": 20, "width": 30, "height": 40 }, "score": 0.91, "mask_ref": null }
  ],
  "warnings": []
}
```

Honest failure: missing model/weights or unreadable file → HTTP 500 with
`{"error": "..."}` (Iris client turns this into `semantics.available: false`
with `skipped_reason`).

## Run a smoke test (no model required)

```bash
python -m unittest src.test_contract
```
