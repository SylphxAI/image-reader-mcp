# Tool surface — Iris

| Tool | Role |
| --- | --- |
| `read_image` | Primary image evidence |
| `image_probe` | Cheap probe without full OCR |
| `crop_region` | Citeable crop evidence |

CLI: `iris` · SDK: `@sylphx/iris/sdk` · Prism retired (host composition only).

## Current Rust-native contract

The `bin/iris` launcher is fail-closed and executes the Rust `iris-mcp-server`.
Its current public schemas are intentionally small:

| Tool | Accepted inputs | Fixed safety boundary |
| --- | --- | --- |
| `read_image` | `path`, optional metadata, local OCR, and region evidence fields | 32 MiB file, 64 MP image (admitted before OCR) |
| `image_probe` | `path` | 32 MiB file |
| `crop_region` | `path`, required `region`, optional render fields | 32 MiB file, 64 MP region |

Unknown fields are rejected. Layout, `agent_map`, semantics, provider, and
caller-supplied resource-budget fields are not silently ignored or delegated to
the residual TypeScript trees. OCR is an opt-in local Tesseract route; when the
binary or requested language pack is unavailable, the result reports
`available: false` and an evidence gap.

Invalid paths, regions, and request fields fail closed as JSON-RPC errors with
`data.status`, a stable error code, and a corrective `data.next_action`; no
partial or invented twin is returned.
