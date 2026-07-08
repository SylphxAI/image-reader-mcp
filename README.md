# Image Reader MCP

> Evidence-first image reading for AI agents — metadata, OCR text, regions, and citeable evidence without generative LLM.

**Status:** bootstrap — repository scaffold; MCP tools not shipped yet.

Orchestrated by [smart-reader-mcp](https://github.com/SylphxAI/smart-reader-mcp) — portfolio ADR lives there, not in pdf-reader-mcp.

| Repository | Role |
| --- | --- |
| [pdf-reader-mcp](https://github.com/SylphxAI/pdf-reader-mcp) | PDF (production) |
| **image-reader-mcp** (this repo) | Image |
| [video-reader-mcp](https://github.com/SylphxAI/video-reader-mcp) | Video |
| [smart-reader-mcp](https://github.com/SylphxAI/smart-reader-mcp) | Unified read + delegate |

## Read vs interpret

**Read** (this repo): extract facts, metadata, transcripts, regions, and timelines with provenance — **no generative LLM required**.

**Interpret** (out of scope): summarize, classify, or answer open questions — belongs in the agent or an optional remote provider adapter.

## Planned MCP surface

Primary tool: `read_image`

## Quick start (after v0.1.0)

```bash
npx @sylphx/image-reader-mcp
```

## License

MIT © [SylphxAI](https://github.com/SylphxAI)
