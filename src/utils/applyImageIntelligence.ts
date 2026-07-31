import type { AgentMediaTwin, ReadImageArgs } from '../schemas/readImage.js';
import { buildAgentImageMap } from './agentMap.js';
import { buildLayoutFromOcrLines } from './layout.js';
import { maybeOptionalImageCaption } from './optionalLlm.js';
import { samplePalette } from './palette.js';

/** Attach layout, palette, optional LLM, and agent_map to an Agent Media Twin. */
export async function applyImageIntelligence(
  twin: AgentMediaTwin,
  resolvedPath: string,
  input: ReadImageArgs,
  includeOcr: boolean
): Promise<AgentMediaTwin> {
  const next: AgentMediaTwin = {
    ...twin,
    trust_warnings: [...twin.trust_warnings],
  };

  const includeLayout = input.include_layout ?? includeOcr;
  if (includeLayout && next.ocr?.lines && next.ocr.lines.length > 0) {
    const layout = buildLayoutFromOcrLines(
      next.ocr.lines.map((line) => ({
        text: line.text,
        bbox: line.bbox,
        ...(line.confidence !== undefined ? { confidence: line.confidence } : {}),
      }))
    );
    next.layout = layout;
    for (const warning of layout.warnings) {
      next.trust_warnings.push(`layout: ${warning}`);
    }
  }

  let palette: Array<{ hex: string; approx_share: number }> | undefined;
  if (input.include_palette) {
    try {
      palette = await samplePalette(resolvedPath);
    } catch {
      next.trust_warnings.push('palette: sampling failed; continuing without palette.');
    }
  }

  const optionalLlm = await maybeOptionalImageCaption({
    path: resolvedPath,
    mime: next.mime,
    enabled: input.include_optional_llm ?? false,
  });
  if (optionalLlm.available) {
    next.trust_warnings.push(
      'optional_llm caption is non-authority; prefer OCR/layout locators for claims.'
    );
  }

  const includeAgentMap = input.include_agent_map ?? true;
  if (includeAgentMap) {
    next.agent_map = buildAgentImageMap({
      filename: next.filename,
      mime: next.mime,
      dimensions: next.dimensions,
      ...(next.layout ? { layout: next.layout } : {}),
      ocrLineCount: next.ocr?.line_count ?? next.ocr?.lines?.length ?? 0,
      ...(palette ? { palette } : {}),
      optionalLlm,
    });
  }

  return next;
}
