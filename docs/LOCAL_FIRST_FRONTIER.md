# Local-first frontier (Iris)

## Principles (hard)

1. **Less dependency** — no heavy npm ML stacks; system binaries + Rust only when present  
2. **Zero config** — `npm i` + path works; no API key required  
3. **Local first, cloud optional** — default offline; cloud only if user sets URL  
4. **Speed / size / performance** — probe path is cheap; OCR opt-in; VLM opt-in  
5. **Rust first** — decode/crop via Rust when staged; TS sharp is fallback  

## Extraction stack (priority)

| Layer | Default | Optional |
| --- | --- | --- |
| Geometry / crop | **Rust** (`image-reader-cli`) | sharp fallback |
| OCR + layout | **Tesseract** on PATH (PSM3 TSV, native blocks) | — |
| Agent map | always available (pure TS) | — |
| VLM caption | off | local **Ollama** vision, or `IRIS_OPTIONAL_LLM_URL` (cloud ok) |

## Zero-config usage

```bash
npm i -g @sylphx/iris   # or @sylphx/image-reader-mcp
# install tesseract on OS for OCR (optional binary, not an npm dep)
read_image { "path": "/abs/a.png", "include_ocr": true }
```

Optional frontier caption (still non-authority):

```bash
# local
ollama pull llava
# then include_optional_llm: true  (auto-discovers 127.0.0.1:11434)

# cloud optional
export IRIS_OPTIONAL_LLM_URL=https://your-endpoint
```

## Not in default path (keeps size/speed)

- No Paddle/npm OCR wheels  
- No browser  
- No required VLM download  
