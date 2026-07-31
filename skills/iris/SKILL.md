# Iris — image evidence for agents

Use Iris when agents need **measurable image facts** (dimensions, metadata, OCR bbox) without default VLM guesses.

## Install

```bash
npx @sylphx/image-reader-mcp
# brand bin
iris doctor
```

## SDK

```ts
import { Iris } from '@sylphx/image-reader-mcp/sdk'
const twin = await Iris.create().read({ path: './sample.png' })
```

## Tool

| Tool | Job |
| --- | --- |
| `read_image` | Agent Media Twin: dimensions, metadata, optional OCR+bbox, trust warnings |

Evidence is on the result (regions, warnings, provenance) — not a separate tool.

Family: https://github.com/SylphxAI/instruments
