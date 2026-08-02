# Iris / Cue — Research Card (5 cells)

**Context:** Owner asked whether Iris/Cue are real value or metadata+OCR trivia, and whether modern local vision can "see" objects/people/animals. Answer: yes — L2 semantics. This card is the decision record.

## 1. Competitive landscape

| Peer class | Examples | Strength | Gap we exploit |
| --- | --- | --- | --- |
| Florence-2 MCP servers | community `mcp-server-florence2`, HF Spaces wrappers | Open-vocab OD + caption + OCR in one model, local | Often ad-hoc/undocumented boxes, no evidence envelope, no authority split |
| Grounding-DINO + SAM pipelines | Grounded-SAM2 projects | Precise open-vocab detection + masks | Heavy (multi-GB), no agent-friendly locateable JSON contract |
| Local VLM MCPs | Ollama llava/qwen-vl based MCPs | Free-form semantic "what's happening" | Non-deterministic, weak/absent bboxes, hallucination, hard to cite |
| Doc/layout OCR (MinerU/Paddle) | MinerU, PaddleOCR, docling | Blocks/tables/layout for documents | Heavy, document-centric, not general open-vocab objects |
| Cloud vision APIs | GPT-4V, Gemini vision, Replicate | Best raw semantic quality + easy | Not local-first, costs, no deterministic locators |
| Video-transcript MCPs | YouTube/whisper MCPs | Speech → text | Timeline structure only; no object semantics; cloud/API-key typical |

## 2. Target / wedge

Local, evidence-first **open-vocab visual semantics with locators** for agents:

- L0/L1 facts (geometry/OCR/layout) always on, deterministic, citeable.
- L2 (`include_semantics`) optional open-vocab objects (people/animals/things) with pixel bboxes + scored_non_locator authority; never clouds L0/L1.
- Video: scene-structural keyframes → Iris objects by timestamp (Cue→Iris compose), no per-frame VLM.
- Zero API key for default path; model weights never bundled; sidecar optional.

## 3. Alternatives considered

| Alt | Verdict |
| --- | --- |
| Bundle an ONNX/transformers model in npm | Rejected — breaks zero-config / size / multi-arch native package policy |
| Cloud-only vision (GPT-4V default) | Rejected — violates Local-first floor |
| Docs-only, no L2 | Rejected — leaves only "metadata wizardry", no wow |
| New separate MCP tool for objects | Rejected — schema explosion; kept one `read_image` + flags |
| Inline Cue OD | Rejected — scope duplication; Cue stays timeline/evidence |

## 4. Risks

- Perception as "another hallucinating caption tool" → mitigated: L2 is opt-in, scored, non-authority vs locators.
- Users without GPU/model get no L2 → honest `skipped_reason`; package still valuable (L0/L1).
- License/weights management → sidecar keeps weights out of repo; adapters remain user-side.
- Over-granular tool surface → kept to one tool + flags.

## 5. Evidence / readback plan

- Contract conformance tests (sidecar normalize + Iris client) — green in CI.
- Mock-oracle compose test (Cue→Iris) — green.
- Live Florence smoke is **residual**: not run in this env (no GPU/model); requires sidecar install + weights, exercised by user/CI-with-GPU.
- North-star oracle: `read_image { include_semantics: true }` on a real photo returns `objects[]` with bboxes; video compose returns timestamped objects.
