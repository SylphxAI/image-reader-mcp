# Iris — image evidence for agents

Use Iris when agents need **measurable image facts** (dimensions, metadata, OCR bbox) without default VLM guesses.

## Install

```bash
npx @sylphx/image-reader-mcp
iris doctor
```

## SDK

```ts
import { Iris } from '@sylphx/image-reader-mcp/sdk'
const twin = await Iris.create().read({ path: './sample.png' })
// optional OCR (requires tesseract on PATH)
const ocr = await Iris.create().read({ path: './sample.png', include_ocr: true })
```

## Tool

| Tool | Job |
| --- | --- |
| `read_image` | Agent Media Twin: dimensions, metadata, optional OCR+bbox, trust warnings |

## Evidence contract

Results include regions, warnings, provenance. There is **no** `evidence_first` tool.
OCR is honest when tesseract is absent (surface unavailable; do not invent text).

Family: https://github.com/SylphxAI/instruments
