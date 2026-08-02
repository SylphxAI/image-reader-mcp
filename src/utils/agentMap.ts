import type { AgentMediaTwin } from '../schemas/readImage.js';
import type { SemanticsResult } from './optionalSemantics.js';

export type AgentImageMap = NonNullable<AgentMediaTwin['agent_map']>;

export function buildAgentImageMap(input: {
  filename: string;
  mime: string;
  dimensions: { width: number; height: number };
  layout?: AgentMediaTwin['layout'];
  ocrLineCount?: number;
  palette?: Array<{ hex: string; approx_share: number }>;
  optionalLlm?: AgentImageMap['optional_llm'];
  semantics?: SemanticsResult | undefined;
}): AgentImageMap {
  const { width, height } = input.dimensions;
  const blocks = input.layout?.blocks ?? [];
  const textPresent = (input.ocrLineCount ?? 0) > 0 || blocks.length > 0;
  const objects = input.semantics?.available ? (input.semantics.objects ?? []) : [];

  const lines: string[] = [
    `# Image map: ${input.filename}`,
    `- mime: ${input.mime}`,
    `- size: ${width}×${height}px`,
    `- text_present: ${textPresent}`,
    `- layout_blocks: ${blocks.length}`,
    `- semantics_objects: ${objects.length}`,
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
  } else if (!textPresent && objects.length === 0) {
    lines.push(
      '',
      '## Notes',
      '- No OCR text recovered. Enable include_ocr for text architecture.',
      '- Enable include_semantics for local open-vocab objects (IRIS_SEMANTICS_URL or Ollama).',
      '- Use crop_region / image_probe for geometry.'
    );
  }

  if (objects.length > 0) {
    lines.push('', '## L2 semantics objects (scored, non-locator authority)');
    for (const obj of objects.slice(0, 24)) {
      const box = obj.bbox
        ? `bbox x=${obj.bbox.x} y=${obj.bbox.y} w=${obj.bbox.width} h=${obj.bbox.height}`
        : 'bbox: n/a';
      const score = obj.score !== undefined ? ` score=${obj.score.toFixed(2)}` : '';
      lines.push(`- ${obj.id}: ${obj.label}${score}; ${box}`);
    }
    if (input.semantics?.caption) {
      lines.push('', '## L2 caption (scored_non_locator)', input.semantics.caption);
    }
  } else if (input.semantics && !input.semantics.available) {
    lines.push('', `## L2 semantics: skipped (${input.semantics.skipped_reason ?? 'unavailable'})`);
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
