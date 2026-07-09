<div align="center">

# 🖼️ Image Reader MCP

### Your agent looked at the image. **Did it see the truth?**

Evidence-first image reading for AI agents. One call turns any local image into an
**Agent Media Twin** — dimensions, metadata, optional OCR with bounding boxes, and
trust warnings you can cite without asking a vision LLM to guess.

[![npm version](https://img.shields.io/npm/v/@sylphx/image-reader-mcp?style=flat-square)](https://www.npmjs.com/package/@sylphx/image-reader-mcp)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](https://opensource.org/licenses/MIT)
[![CI/CD](https://img.shields.io/github/actions/workflow/status/SylphxAI/image-reader-mcp/ci.yml?style=flat-square&label=CI/CD)](https://github.com/SylphxAI/image-reader-mcp/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-blue.svg?style=flat-square)](https://www.typescriptlang.org/)

**Local-first** · **One smart `read_image` call** · **Evidence with bbox + provenance** · **23 tests**

[⭐ Star this repo](https://github.com/SylphxAI/image-reader-mcp) if agents should read images with facts, not vision-model guesses.
· [Quick start](#quick-start) · [See it work](#see-it-work) · [Why not vision LLM guess?](#why-not-vision-llm-guess)

Part of the Sylphx Reader portfolio — orchestration and portfolio ADR live in
[smart-reader-mcp](https://github.com/SylphxAI/smart-reader-mcp).

</div>

---

## The problem

Images are not filenames. They are pixels, EXIF, orientation, embedded GPS,
hidden metadata, and text that only exists if you OCR it with geometry.

Most agent stacks route images through a **vision LLM** and get a plausible
description. Dimensions get rounded. OCR text gets paraphrased. Metadata
disappears. Citations become "the model said so." Then the agent hallucinates —
confidently.

**Image Reader MCP is built for the moment your agent needs measurable facts about
an image, not a creative caption.**

## Why not vision LLM guess?

| Typical vision path | Image Reader MCP |
| --- | --- |
| "Describe this image" | Return filename, mime, dimensions, and structured metadata |
| Paraphrased OCR | Optional Tesseract lines with bounding boxes and confidence |
| GPS and EXIF leak into context | GPS redacted; trust warnings for suspicious metadata |
| No provenance | Agent Media Twin JSON with measurable, citeable fields |
| Cloud API by default | **Local-first** — sharp + exifr on your machine |
| Ship and pray | **23** unit tests on schema, metadata, OCR hooks, safety limits, doctor, and release gate |

## See it work

**Install once. Call once.**

```bash
claude mcp add image-reader -- npx @sylphx/image-reader-mcp
```

```json
{
  "path": "/absolute/path/to/photo.jpg",
  "include_metadata": true,
  "include_ocr": true
}
```

`read_image` inspects the file locally and returns an Agent Media Twin — no
generative LLM required:

```json
{
  "filename": "photo.jpg",
  "mime": "image/jpeg",
  "dimensions": { "width": 4032, "height": 3024 },
  "orientation": 1,
  "metadata": {
    "Make": "ExampleCamera",
    "Model": "Pro X",
    "DateTimeOriginal": "2026-03-15T14:22:10"
  },
  "ocr": {
    "available": true,
    "lines": [
      {
        "text": "INVOICE #1042",
        "bbox": { "x": 120, "y": 48, "width": 310, "height": 36 },
        "confidence": 92
      }
    ]
  },
  "trust_warnings": []
}
```

Abbreviated shape — optional OCR skips gracefully when Tesseract is not installed.

## MCP Tool Surface

| Tool | Use it when the agent needs to... |
| --- | --- |
| `read_image` | Read a local image and return dimensions, mime, metadata, optional OCR, and trust warnings. |

Supported formats: PNG, JPEG, GIF, WebP, TIFF, and other formats sharp can decode.

## Quick Start

### Claude Code

```bash
claude mcp add image-reader -- npx @sylphx/image-reader-mcp
```

### Claude Desktop

Add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "image-reader": {
      "command": "npx",
      "args": ["@sylphx/image-reader-mcp"]
    }
  }
}
```

### Any MCP Client

```bash
npx @sylphx/image-reader-mcp
```

Node.js `>=22.13` is required. Optional OCR uses a local Tesseract adapter when
installed — no cloud credentials required by default.

## Development

```bash
git clone https://github.com/SylphxAI/image-reader-mcp.git
cd image-reader-mcp
bun install
bun run build
bun test
bun run doctor
bun run benchmark:release-gate
```

Useful checks:

```bash
bun run check
bun run typecheck
bun run validate
bun run benchmark:release-gate
```

Example `read_image` requests live in [`examples/`](examples/).

## Support

- [Issues](https://github.com/SylphxAI/image-reader-mcp/issues)
- [npm package](https://www.npmjs.com/package/@sylphx/image-reader-mcp)
- Portfolio orchestration: [smart-reader-mcp](https://github.com/SylphxAI/smart-reader-mcp)

## Help this reach more builders

If vision-model guesses have wasted your context, your citations, or your trust
in agent output, you are exactly who this project is for.

**[⭐ Star the repo](https://github.com/SylphxAI/image-reader-mcp)** — it is the
fastest way to help more agent builders find evidence-first image reading. Share
it in your MCP client setup, team wiki, or agent stack README.

### Discovery (in progress)

| Channel | Status |
| --- | --- |
| [Glama MCP directory](https://glama.ai/mcp/servers/SylphxAI/image-reader-mcp) | Listed — [claim server](https://glama.ai/mcp/servers/SylphxAI/image-reader-mcp/admin) for full discoverability |
| [Official MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.SylphxAI/image-reader-mcp) | Listed — `io.github.SylphxAI/image-reader-mcp` @ v0.1.0 |
| [TensorBlock MCP Index PR #1113](https://github.com/TensorBlock/awesome-mcp-servers/pull/1113) | Open — multimedia/document processing listing |
| [MCP servers community issue #4500](https://github.com/modelcontextprotocol/servers/issues/4500) | Open — community server highlight |
| [mcp.so listing issue #3068](https://github.com/chatmcp/mcpso/issues/3068) | Open — directory submission request |
| [mcpservers.org submit](https://mcpservers.org/submit) | Not listed yet — free web-form submission |

Know another MCP directory? [Open an issue](https://github.com/SylphxAI/image-reader-mcp/issues/new) with the link.

## License

MIT © [SylphxAI](https://github.com/SylphxAI)