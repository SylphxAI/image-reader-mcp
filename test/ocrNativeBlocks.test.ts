import { describe, expect, test } from 'bun:test';
import { buildBestEffortLayout } from '../src/utils/layout.js';
import { parseTesseractTsv } from '../src/utils/ocr.js';

const SAMPLE = `level	page_num	block_num	par_num	line_num	word_num	left	top	width	height	conf	text
1	1	0	0	0	0	0	0	100	100	-1	
2	1	1	0	0	0	10	10	80	40	-1	
3	1	1	1	0	0	10	10	80	18	-1	
4	1	1	1	1	0	10	10	80	12	-1	
5	1	1	1	1	1	10	10	40	12	90	Hello
5	1	1	1	1	2	55	10	30	12	88	World
3	1	1	2	0	0	10	32	70	14	-1	
4	1	1	2	2	0	10	32	70	12	-1	
5	1	1	2	2	1	10	32	70	12	92	Sidebar
`;

describe('local-first frontier OCR layout', () => {
  test('parses native blocks and prefers them for layout', () => {
    const parsed = parseTesseractTsv(SAMPLE, { includeWords: true });
    expect(parsed.lines.length).toBeGreaterThan(0);
    expect(parsed.native_blocks.length).toBeGreaterThan(0);
    const layout = buildBestEffortLayout({
      lines: parsed.lines,
      nativeBlocks: parsed.native_blocks,
    });
    expect(layout.policy).toContain('tesseract_native');
    expect(layout.full_text.toLowerCase()).toMatch(/hello|world|sidebar/);
  });
});
