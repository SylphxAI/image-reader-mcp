# Iris — competitive positioning

## Job

Image evidence for agents

## Wedge

Non-LLM image evidence: metadata, OCR boxes, crops, locators — local and deterministic.

## Local-first

Local decode/OCR path; no generative vision model required.

## Peer anchors (learn; do not clone)

| Peer | Gap we exploit |
| --- | --- |
| Eventual-Inc/local-image-search | Local CLIP search index — retrieval, not citeable OCR/regions/crops |
| Tesseract OCR MCP servers | Text dump OCR; weak metadata/region/crop evidence envelopes |
| Vision LLM tools | Generative, non-deterministic, expensive, not citeable geometry |

## Non-goals

- Becoming a cloud SaaS wrapper as the default path
- Multi-product monorepo for star aggregation
- Generative summaries as the sole evidence authority

## 2026-07-31 research note

See docs/specs/agent-*-read-contract.md for competitive synthesis and product decisions.


## Zero-config CTA

```bash
npx -y @sylphx/iris
```

Live **@sylphx/iris@0.2.1**. Bare MCP stdio for agents.
