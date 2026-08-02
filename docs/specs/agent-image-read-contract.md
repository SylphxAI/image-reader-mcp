# Iris — Agent Image Read Contract

## Job

Let agents **read** an image (architecture + text + locators), not merely dump pixels or require a vision LLM.

## Competitive synthesis (what good looks like)

| Peer class | Strength | Gap we exploit |
| --- | --- | --- |
| Tesseract OCR MCPs | Text extraction | Weak structure / agent map |
| CLIP local search | Retrieval | Not citeable layout |
| VLM caption tools | Semantic prose | Non-deterministic, not local default, weak locators |
| Document layout OCR (Paddle/MinerU-class) | Blocks/tables | Heavy; we stay image-agent light + optional LLM |

## Default path (local-first)

1. **Probe** geometry (w×h, mime, alpha, color space)  
2. **Metadata** EXIF/XMP/IPTC (GPS redacted)  
3. **OCR** (optional flag): lines + optional words with bbox + confidence  
4. **Layout** (from OCR): reading-order **text blocks** (`ocr_line_cluster_v1`)  
5. **agent_map**: markdown-ish outline a text-only model can consume  
6. **crop_region** for pixel-level follow-up evidence  

## Pixel claims

- Do **not** invent per-pixel semantics in the default path.  
- For a region: `crop_region` / `region` on `read_image` → hash + optional PNG.  
- Palette is approximate local stats, not segmentation.

## Optional LLM (non-authority)

- `include_optional_llm` + `IRIS_OPTIONAL_LLM_URL`  
- Caption may enrich `agent_map` but **never** overrides OCR/layout locators  
- Fail closed when unset

## L2 Semantics (scored_non_locator)

- `include_semantics`: `true` | `false` | `"auto"` (default **false**)  
- Backends: `IRIS_SEMANTICS_URL` (Florence/Grounding-DINO/SAM adapter) → Ollama structured vision  
- Output: `semantics.objects[]` with optional bbox/score + optional caption  
- **Never** overrides OCR/layout locators; always carries route/model/warnings  
- Spec: [local-semantics-l2.md](./local-semantics-l2.md) · ADR-20260802

## Tool surface (keep few)

| Tool | Role |
| --- | --- |
| `read_image` | Primary twin + map |
| `image_probe` | Cheap geometry |
| `crop_region` | Citeable crop |

## Agent usage

```json
{ "path": "/abs/ui.png", "include_ocr": true, "include_layout": true, "include_agent_map": true }
```

```json
{ "path": "/abs/photo.jpg", "include_semantics": true, "semantics_prompt": "people and animals" }
```
