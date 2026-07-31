# Tool surface — this product

Policy: **few, powerful, obvious** tools. Prefer the primary read tool first.

| Tool | Role |
| --- | --- |
| `read_image` | Primary image evidence (metadata + OCR text) |
| `image_probe` | Cheap probe without full OCR |
| `crop_region` | Citeable crop evidence |
| CLI `iris` | Brand CLI |
| SDK `./sdk` | Programmatic API |

## Rules

1. Do not add near-duplicate tools that only differ by vanity naming.
2. Advanced tools must be labeled advanced in README/skill.
3. Schema fields should be agent-obvious; fail closed on unsafe input.
4. Composition with sibling products is via public contracts, not monorepo imports.
