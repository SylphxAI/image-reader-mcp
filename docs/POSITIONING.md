# Iris — positioning

## One-liner

**Iris**: Image evidence for agents — local-first, fast, light, powerful.

## Why agents use this

Non-LLM image evidence: metadata, OCR boxes, crops, locators — local and deterministic.

## Surfaces

| Surface | Role |
| --- | --- |
| MCP | Agent tools over stdio |
| CLI | Human/scriptable brand bin |
| SDK | Programmatic library for apps and internal dogfood |

## Primary tools

- `read_image`
- `image_probe`
- `crop_region`

## Evidence

See [EVIDENCE_CONTRACT.md](./EVIDENCE_CONTRACT.md).

## Independence

See [PRODUCT_INDEPENDENCE.md](./PRODUCT_INDEPENDENCE.md).

## Competitive

See [COMPETITIVE.md](./COMPETITIVE.md).

## Completion bar

See [IPPB.md](./IPPB.md).

## L2 local semantics (2026-08)

Optional open-vocab objects + caption via local Florence/DINO/SAM adapters or Ollama,
behind `include_semantics`. Default remains L0/L1 facts only (zero-config).

## Zero-config

```bash
npx -y @sylphx/iris
```
