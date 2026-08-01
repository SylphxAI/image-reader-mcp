# Local-first frontier (Iris)

## Principles (hard)

1. **Less dependency** — no npm ML wheels; system binaries + Rust natives  
2. **Zero config** — path-only read works without API keys  
3. **Local first, cloud optional** — OCR local; VLM only if user opts in  
4. **Speed / size / performance** — cheap probe; OCR opt-in  
5. **Rust first** — decode/crop/MCP via native when staged  
6. **Simple but powerful** — lead with `read_image`

## What is true today (evidence)

| Layer | Status | Evidence |
| --- | --- | --- |
| MCP launcher | Rust-first fail-closed | `bin/image-reader-mcp` → staged native server |
| Package size | **~9.7 MB unpacked** | almost entirely `bin/native/image-reader-mcp-server` |
| npm hard deps | **Improved** | hard: `@modelcontextprotocol/sdk`, `zod` for doctor/SDK; `sharp`/`exifr` **optional** |
| OCR | Local optional | Tesseract on PATH (not npm wheel) |
| VLM | Optional | Ollama local or `IRIS_OPTIONAL_LLM_URL` — non-authority |

## Target architecture

```
Agent ──MCP──► iris native ──► decode/crop (Rust)
                    │
                    ├─ OCR: tesseract on PATH (opt-in)
                    └─ VLM caption: opt-in only (Ollama/cloud URL)
```

### Non-negotiable targets

1. Drop **sharp** from the default install once Rust decode covers probe/crop (sharp = optional fallback package only).  
2. Prefer **Citra packaging**: thin meta package + platform optionalDependencies, not one fat multi-host native in every tarball if avoidable.  
3. Keep **3 tools max** public: `read_image`, `image_probe`, `crop_region`.  
4. Never require a cloud vision model for “success”.  
5. Evidence = bbox + path + route + warnings — not generative rewrite as authority.

## Peer anchors

| Peer class | Gap we exploit |
| --- | --- |
| Cloud vision MCP (Grok/OpenAI image) | Needs keys; non-deterministic; weak citeable geometry |
| Tesseract-only OCR MCP | Text dump without layout/agent_map/crops |
| Local CLIP gallery search | Retrieval gallery ≠ citeable OCR/regions |

## Zero-config usage

```bash
npx -y @sylphx/iris
# read_image { "path": "/abs/a.png", "include_ocr": true }  # needs tesseract for OCR text
```

## Progress / residual

- Native MCP path is fail-closed Rust (primary).  
- **`sharp` + `exifr` demoted to optionalDependencies** (2026-08-01); Rust decode does not need them.  
- Remaining hard deps for doctor/TS SDK helpers: `@modelcontextprotocol/sdk`, `zod`.  
- **Citra-style multi-arch optionalDependencies** for natives (`@sylphx/image-reader-mcp-<platform>`); main package no longer embeds `bin/native` in published files.
