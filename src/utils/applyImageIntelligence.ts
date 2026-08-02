import type { AgentMediaTwin, ReadImageArgs } from '../schemas/readImage.js';
import { buildAgentImageMap } from './agentMap.js';
import { buildBestEffortLayout } from './layout.js';
import { maybeOptionalImageCaption } from './optionalLlm.js';
import { maybeImageSemantics } from './optionalSemantics.js';
import { samplePalette } from './palette.js';

/** Attach layout, palette, optional LLM/semantics, and agent_map to an Agent Media Twin. */
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
    const ocrAny = next.ocr as {
      lines: Array<{
        text: string;
        bbox: { x: number; y: number; width: number; height: number };
        confidence?: number;
      }>;
      native_blocks?: Array<{
        id: string;
        kind: 'block' | 'paragraph';
        text: string;
        bbox: { x: number; y: number; width: number; height: number };
        confidence?: number;
      }>;
    };
    const layout = buildBestEffortLayout({
      lines: ocrAny.lines.map((line) => ({
        text: line.text,
        bbox: line.bbox,
        ...(line.confidence !== undefined ? { confidence: line.confidence } : {}),
      })),
      ...(ocrAny.native_blocks ? { nativeBlocks: ocrAny.native_blocks } : {}),
    });
    next.layout = layout;
    next.trust_warnings.push(`layout_policy: ${layout.policy}`);
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

  const semantics = await maybeImageSemantics({
    path: resolvedPath,
    mime: next.mime,
    width: next.dimensions.width,
    height: next.dimensions.height,
    include: input.include_semantics,
    prompt: input.semantics_prompt,
  });
  if (semantics) {
    next.semantics = semantics;
    if (semantics.available) {
      next.trust_warnings.push(
        `semantics L2 via ${semantics.route ?? 'unknown'} is scored_non_locator; never overrides OCR/layout.`
      );
      if (semantics.object_count) {
        next.trust_warnings.push(`semantics_objects: ${semantics.object_count}`);
      }
    } else if (semantics.skipped_reason) {
      next.trust_warnings.push(`semantics_skipped: ${semantics.skipped_reason}`);
    }
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
      ...(semantics ? { semantics } : {}),
    });
  }

  return next;
}
