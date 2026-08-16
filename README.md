<!-- Marketing: promise → CTA → comparison → why → demo → tools → docs -->
<div align="center">

# Iris

### Image evidence for agents — not vision-model guesses.

**Local-first image facts** your agent can cite: dimensions, metadata, regions, and optional OCR boxes.

**Canonical** [`@sylphx/iris`](https://www.npmjs.com/package/@sylphx/iris) · **bin** `iris` · **live** `0.2.1`

[![npm version](https://img.shields.io/npm/v/@sylphx/iris?style=flat-square)](https://www.npmjs.com/package/@sylphx/iris)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](https://opensource.org/licenses/MIT)
[![stars](https://img.shields.io/github/stars/SylphxAI/image-reader-mcp?style=flat-square)](https://github.com/SylphxAI/image-reader-mcp/stargazers)

</div>

## Zero-config in one line

```bash
npx -y @sylphx/iris
```

No API key. No global install. Starts a **stdio MCP server** agents can spawn immediately.

| Client | Setup |
| --- | --- |
| **Any agent / CLI** | `npx -y @sylphx/iris` |
| **Claude Code** | `claude mcp add iris -- npx -y @sylphx/iris` |
| **Desktop / Cursor / VS Code / Codex** | `"command": "npx", "args": ["-y", "@sylphx/iris"]` |

## Why Iris feels unfairly good

Your agent looked at the image. **Did it see the truth?**

| Vision model guess | **Iris** |
| --- | --- |
| Facts vary by model | **Deterministic media twin** |
| OCR paraphrased | Native OCR **with bboxes + confidence** when Tesseract is installed |
| Cloud API by default | **Local-first**, no key required for core path |
| Setup: keys + SDKs | **`npx -y` — done** |
| Brand mix | `@sylphx/iris` · bin `iris` · brand-sole `serverInfo.name=iris` |

### Five reasons teams pick Iris

1. **Zero-config MCP** — real one-liner for agents.
2. **Facts over captions** — measurable fields agents can defend.
3. **Local-first** — geometry + optional OCR without a default cloud VLM; layout remains an evidence-shaped native target.
4. **Fail closed** — missing native binary does not silently invent an engine.
5. **Family ready** — compose with Citra (PDF), Cue (video), Locus (code).

## What agents get

Primary surface centers on **`read_image`** (Agent Media Twin). Optional advanced paths stay evidence-shaped.

Minimal call:

```json
{ "path": "/absolute/path/to/photo.jpg" }
```

### Flagship use cases

1. **Screenshots & UI captures** — dimensions, OCR text regions, and citeable crops without VLM paraphrase
2. **Document photos** — OCR lines with geometry for citation when Tesseract is installed
3. **Trust / privacy** — EXIF/GPS handling and trust warnings when requested  

## Product docs

| Doc | Purpose |
| --- | --- |
| [docs/POSITIONING.md](docs/POSITIONING.md) | Strategic positioning |
| [docs/COMPETITIVE.md](docs/COMPETITIVE.md) | Peer anchors and wedge |
| [docs/EVIDENCE_CONTRACT.md](docs/EVIDENCE_CONTRACT.md) | Evidence = result contract |
| [docs/TOOL_SURFACE.md](docs/TOOL_SURFACE.md) | Few clear tools policy |
| [docs/PRODUCT_INDEPENDENCE.md](docs/PRODUCT_INDEPENDENCE.md) | This repo is SSOT |
| [docs/IPPB.md](docs/IPPB.md) | Independent public product bar |
| [docs/PUBLISH.md](docs/PUBLISH.md) | npm / git publish status |


## See objects (L2, optional)

With a local Florence-class sidecar or Ollama, the same `read_image` can return **open-vocab objects** with pixel bboxes and scores:

```json
{ "path": "/abs/photo.jpg", "include_semantics": true, "semantics_prompt": "people and animals" }
```

Objects are `scored_non_locator` evidence — deterministic L0/L1 facts (geometry/OCR/layout) stay authoritative and always on.

## Read images (not vague vision)

Iris is **local-first**: geometry first, with optional OCR; layout blocks and
**agent_map** remain evidence-shaped native targets that require Rust proof before
they become public MCP routes.

Spec: [docs/specs/agent-image-read-contract.md](docs/specs/agent-image-read-contract.md)

**Local-first frontier:** Rust decode + optional local Tesseract OCR now; Tesseract layout blocks, optional Ollama VLM, and cloud URL remain opt-in routes. Zero API key. Optional **L2 local semantics** (include_semantics) is a target for open-vocab objects (people/animals/things) with pixel bboxes via an official Florence-class sidecar (examples/florence-sidecar/) or Ollama — never authority over OCR/layout locators. The current Rust MCP rejects routes that are not yet implemented there.

## See it work

### Why Iris wins for agents

1. **Zero-config** — `npx -y @sylphx/iris` starts MCP on stdio.
2. **Facts over captions** — structure agents can cite, not free-text “I see a chart”.
3. **Local-first** — files never leave the machine by default.
4. **Family** — pair with Citra (PDF), Cue (video), Locus (code).

## MCP Tool Surface

| Tool | Use it when the agent needs to... |
| --- | --- |
| `read_image` | Read a local image and return dimensions, mime, metadata, optional local OCR, optional region evidence, and trust warnings. |

### Rust-native authority boundary

The `iris` launcher is fail-closed and runs the Rust MCP server. The current
native contract exposes `read_image`, `image_probe`, and `crop_region` with
fixed safety budgets; OCR is an optional local Tesseract route. Unknown layout,
`agent_map`, semantics, provider, and caller-supplied budget fields are rejected.
Residual TypeScript helpers are not an alternate MCP backend. The remaining
layout/semantics roadmap stays evidence-shaped and requires Rust proof before
becoming public.

Supported formats: PNG, JPEG, GIF, WebP, TIFF, and other formats the **Rust decode engine** supports (optional sharp covers additional formats when installed).

## Quick Start

### Claude Code

```bash
```

### Claude Desktop

Add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "iris": {
      "command": "npx",
      "args": ["-y", "@sylphx/iris"]
    }
  }
}
```

### Any MCP Client

```bash
npx -y @sylphx/iris
```

Node.js `>=22.13` is required. Optional OCR uses local Tesseract when installed;
no cloud credentials are required by default.

## Security model

- **Local-first** — `read_image` resolves paths on the local machine; no cloud vision API by default.
- **GPS redaction** — location metadata is stripped from agent-facing output unless explicitly opted in.
- **Size and format limits** — oversized or unsupported inputs return structured errors, not partial guesses.
- **Optional OCR** — Tesseract runs locally when installed; missing OCR is reported as `available: false`, not silent failure.
- **Trust warnings** — suspicious EXIF, orientation, or metadata anomalies surface in `trust_warnings` for agent verification.

## Release proof

Claims are backed by CI `benchmark:release-gate` and the shipped-path matrix (Rust-default route, no legacy Node engine on primary tools).

```bash
bun run benchmark:release-gate
```

Artifact: `benchmark-artifacts/image_reader_release_gate.json` — must report `status: passed` before release.

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
- [npm package](https://www.npmjs.com/package/@sylphx/iris)
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
