/**
 * Text-only Agent Map: lets a non-vision model "read" the image architecture.
 * Deterministic, local-first. Optional LLM captions are layered elsewhere.
 */

import type { ImageLayout } from './layout.js';

export type AgentImageMap = {
  policy: 'agent_image_map_v1';
  filename: string;
  mime: string;
  dimensions: { width: number; height: number };
  /** Human/agent readable outline (markdown-ish, not prose hallucination). */
  outline: string;
  text_present: boolean;
  block_count: number;
  palette?: Array<{ hex: string; approx_share: number }>;
  optional_llm?: {
    available: boolean;
    skipped_reason?: string;
    route?: string;
    caption?: string;
  };
};

export function buildAgentImageMap(input: {
  filename: string;
  mime: string;
  dimensions: { width: number; height: number };
  layout?: ImageLayout;
  ocrLineCount?: number;
  palette?: Array<{ hex: string; approx_share: number }>;
  optionalLlm?: AgentImageMap['optional_llm'];
}): AgentImageMap {
  const { width, height } = input.dimensions;
  const blocks = input.layout?.blocks ?? [];
  const textPresent = (input.ocrLineCount ?? 0) > 0 || blocks.length > 0;

  const lines: string[] = [
    `# Image map: ${input.filename}`,
    `- mime: ${input.mime}`,
    `- size: ${width}×${height}px`,
    `- text_present: ${textPresent}`,
    `- layout_blocks: ${blocks.length}`,
  ];

  if (input.palette && input.palette.length > 0) {
    lines.push(
      `- palette: ${input.palette.map((p) => `${p.hex}~${Math.round(p.approx_share * 100)}%`).join(', ')}`
    );
  }

  if (blocks.length > 0) {
    lines.push('', '## Reading-order text blocks');
    for (const b of blocks) {
      const preview = b.text.replace(/\s+/g, ' ').slice(0, 160);
      lines.push(
        `### ${b.id} (order ${b.reading_order}, ${b.line_count} lines)`,
        `- bbox: x=${b.bbox.x} y=${b.bbox.y} w=${b.bbox.width} h=${b.bbox.height}`,
        `- text: ${preview}${b.text.length > 160 ? '…' : ''}`,
        ''
      );
    }
  } else if (!textPresent) {
    lines.push(
      '',
      '## Notes',
      '- No OCR text recovered. Enable include_ocr for text architecture.',
      '- Use crop_region / image_probe for geometry; optional LLM caption only if configured.'
    );
  }

  if (input.optionalLlm?.available && input.optionalLlm.caption) {
    lines.push('', '## Optional LLM caption (non-authority)', input.optionalLlm.caption);
  } else if (input.optionalLlm && !input.optionalLlm.available) {
    lines.push(
      '',
      `## Optional LLM: skipped (${input.optionalLlm.skipped_reason ?? 'not configured'})`
    );
  }

  return {
    policy: 'agent_image_map_v1',
    filename: input.filename,
    mime: input.mime,
    dimensions: input.dimensions,
    outline: lines.join('\n'),
    text_present: textPresent,
    block_count: blocks.length,
    ...(input.palette ? { palette: input.palette } : {}),
    ...(input.optionalLlm ? { optional_llm: input.optionalLlm } : {}),
  };
}
