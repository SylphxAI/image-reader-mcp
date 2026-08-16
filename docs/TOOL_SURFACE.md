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
| `read_image` | `path`, optional metadata/region evidence fields | 32 MiB file, 64 MP image |
| `image_probe` | `path` | 32 MiB file |
| `crop_region` | `path`, required `region`, optional render fields | 32 MiB file, 64 MP region |

Unknown fields are rejected. In particular, OCR, layout, `agent_map`, semantics,
provider, and caller-supplied resource-budget fields are not silently ignored or
delegated to the residual TypeScript trees. Those capabilities remain product
targets and may be exposed only after their Rust authority and benchmark proof
land.
