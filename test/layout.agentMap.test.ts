import { describe, expect, test } from 'bun:test';
import { buildAgentImageMap } from '../src/utils/agentMap.js';
import { buildLayoutFromOcrLines } from '../src/utils/layout.js';

describe('Iris layout + agent map', () => {
  test('clusters nearby lines into reading-order blocks', () => {
    const layout = buildLayoutFromOcrLines([
      { text: 'Hello', bbox: { x: 10, y: 10, width: 40, height: 12 } },
      { text: 'World', bbox: { x: 10, y: 24, width: 50, height: 12 } },
      { text: 'Sidebar', bbox: { x: 200, y: 10, width: 60, height: 12 } },
    ]);
    expect(layout.block_count).toBeGreaterThanOrEqual(2);
    expect(layout.full_text).toContain('Hello');
    expect(layout.blocks[0]?.reading_order).toBe(1);
  });

  test('agent map outlines structure without vision prose', () => {
    const layout = buildLayoutFromOcrLines([
      { text: 'Title', bbox: { x: 0, y: 0, width: 100, height: 20 } },
    ]);
    const map = buildAgentImageMap({
      filename: 'a.png',
      mime: 'image/png',
      dimensions: { width: 100, height: 80 },
      layout,
      ocrLineCount: 1,
    });
    expect(map.outline).toContain('# Image map');
    expect(map.outline).toContain('Title');
    expect(map.text_present).toBe(true);
  });
});
