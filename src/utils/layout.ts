/**
 * Deterministic layout structure from OCR line boxes (no generative model).
 */

export type BBox = { x: number; y: number; width: number; height: number };

export type LayoutLine = {
  text: string;
  bbox: BBox;
  confidence?: number;
};

export type LayoutBlock = {
  id: string;
  kind: 'text_block';
  text: string;
  bbox: BBox;
  line_count: number;
  reading_order: number;
};

export type ImageLayout = {
  policy: string;
  block_count: number;
  blocks: LayoutBlock[];
  full_text: string;
  warnings: string[];
};

const unionBBox = (boxes: BBox[]): BBox => {
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const median = (values: number[], fallback: number): number => {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? fallback;
};

const shouldMerge = (prev: LayoutLine, next: LayoutLine, yGap: number, xSlop: number): boolean => {
  const verticalClose = next.bbox.y - (prev.bbox.y + prev.bbox.height) <= yGap;
  const prevRight = prev.bbox.x + prev.bbox.width;
  const nextRight = next.bbox.x + next.bbox.width;
  const horizontalOverlap =
    Math.min(prevRight, nextRight) - Math.max(prev.bbox.x, next.bbox.x) > -xSlop;
  return verticalClose && horizontalOverlap;
};

const toBlock = (lines: LayoutLine[], index: number): LayoutBlock => {
  const ordered = [...lines].sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  const text = ordered
    .map((l) => l.text.trim())
    .filter(Boolean)
    .join('\n');
  return {
    id: `block-${index + 1}`,
    kind: 'text_block',
    text,
    bbox: unionBBox(ordered.map((l) => l.bbox)),
    line_count: ordered.length,
    reading_order: index + 1,
  };
};

export function buildLayoutFromOcrLines(lines: LayoutLine[]): ImageLayout {
  if (lines.length === 0) {
    return {
      policy: 'ocr_line_cluster_v1',
      block_count: 0,
      blocks: [],
      full_text: '',
      warnings: ['No OCR lines available for layout clustering.'],
    };
  }

  const sorted = [...lines].sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  const medianHeight = median(
    sorted.map((l) => l.bbox.height).filter((h) => h > 0),
    16
  );
  const yGap = Math.max(8, medianHeight * 1.4);
  const xSlop = medianHeight * 2;

  const clusters: LayoutLine[][] = [];
  for (const line of sorted) {
    const last = clusters[clusters.length - 1];
    const prev = last?.[last.length - 1];
    if (last && prev && shouldMerge(prev, line, yGap, xSlop)) {
      last.push(line);
    } else {
      clusters.push([line]);
    }
  }

  const blocks = clusters.map((cluster, index) => toBlock(cluster, index));
  const warnings: string[] = [];
  if (blocks.length === 1 && lines.length > 8) {
    warnings.push(
      'Layout collapsed to a single block; image may be dense continuous text or OCR line geometry is coarse.'
    );
  }

  return {
    policy: 'ocr_line_cluster_v1',
    block_count: blocks.length,
    blocks,
    full_text: blocks.map((b) => b.text).join('\n\n'),
    warnings,
  };
}
