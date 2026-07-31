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
const ocr = await Iris.create().read({
  path: './sample.png',
  include_ocr: true,
  ocr_languages: ['eng'],
  ocr_min_confidence: 50,
  include_ocr_words: false,
})
```

## Tool

| Tool | Job |
| --- | --- |
| `read_image` | Agent Media Twin: dimensions, metadata, optional OCR+bbox, trust warnings |

### OCR flags (evidence-first)

| Flag | Meaning |
| --- | --- |
| `include_ocr` | Run local Tesseract TSV adapter (default false) |
| `ocr_languages` | Tesseract langs, e.g. `["eng","chi_sim"]` |
| `ocr_min_confidence` | Drop words below confidence (0–100) |
| `include_ocr_words` | Also return word-level bbox evidence |

OCR result carries `route=tesseract_tsv`, `languages`, `line_count`, `dropped_low_confidence`.

## Evidence contract

Results include regions, warnings, provenance. There is **no** `evidence_first` tool.
OCR is honest when tesseract is absent (surface unavailable; do not invent text).


## Multi-language OCR residual

Iris accepts `ocr_languages` (Tesseract codes) and reports `languages_warning` when a requested pack is missing (`tesseract --list-langs`).

Install extra packs on the host, for example:

```bash
# Debian/Ubuntu examples — package names vary by distro
sudo apt-get install -y tesseract-ocr-eng tesseract-ocr-chi-sim tesseract-ocr-jpn
```

Until CI ships multi-traineddata corpora, multi-lang depth is **host-dependent honesty**, not a false "full multi-lang OCR suite" claim.
