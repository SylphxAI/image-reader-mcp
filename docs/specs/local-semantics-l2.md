# Iris L2 — Local semantics envelope

## Input (`read_image`)

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `include_semantics` | `boolean \| "auto"` | `false` | Request open-vocab objects + optional caption |
| `semantics_prompt` | string? | — | Optional focus (e.g. "ui widgets", "animals") |

## Output (`semantics` on Agent Media Twin)

```json
{
  "available": true,
  "authority": "scored_non_locator",
  "route": "iris-semantics-http|ollama-structured",
  "model": "florence2|llava:…",
  "caption": "optional short factual caption",
  "object_count": 2,
  "objects": [
    {
      "id": "obj_1",
      "label": "person",
      "category": "person",
      "bbox": { "x": 10, "y": 20, "width": 100, "height": 200 },
      "score": 0.91,
      "mask_ref": null
    }
  ],
  "warnings": []
}
```

When unavailable:

```json
{ "available": false, "skipped_reason": "no local semantics backend configured", "authority": "scored_non_locator" }
```

## HTTP adapter contract (`IRIS_SEMANTICS_URL`)

`POST` JSON:

```json
{ "path": "/abs/a.png", "mime": "image/png", "purpose": "image_semantics", "prompt": "optional" }
```

Response JSON:

```json
{
  "caption": "string?",
  "model": "string?",
  "objects": [
    { "label": "dog", "bbox": { "x":0, "y":0, "width":10, "height":10 }, "score": 0.8, "mask_ref": "optional" }
  ]
}
```

## Env

| Env | Role |
| --- | --- |
| `IRIS_SEMANTICS_URL` | Preferred local/remote adapter (often localhost Florence/DINO service) |
| `IRIS_OLLAMA_URL` / `OLLAMA_HOST` | Fallback structured VLM |
| `IRIS_OLLAMA_VISION_MODEL` | Force model name |

## Official sidecar

A reference adapter lives at [`examples/florence-sidecar/`](../../examples/florence-sidecar/README.md).
It implements this exact contract with a local Florence-2 class model so
`read_image { include_semantics: true }` returns open-vocab objects with pixel
bboxes, fully offline. Model weights are **not** bundled into the Iris package.

## Agent usage

```json
{ "path": "/abs/photo.jpg", "include_ocr": true, "include_semantics": true }
```
