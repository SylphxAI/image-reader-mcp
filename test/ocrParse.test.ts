import { describe, expect, test } from 'bun:test';
import { parseTesseractTsv } from '../src/utils/ocr.ts';

// Minimal Tesseract TSV: header + two level-5 word rows on same line_num=1, one low conf
const sampleTsv = [
  'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
  '5\t1\t1\t1\t1\t1\t10\t20\t40\t12\t95\tHello',
  '5\t1\t1\t1\t1\t2\t55\t20\t50\t12\t90\tWorld',
  '5\t1\t1\t1\t2\t1\t10\t40\t30\t12\t10\tnoise',
].join('\n');

describe('parseTesseractTsv', () => {
  test('groups words into lines with bbox and average confidence', () => {
    const parsed = parseTesseractTsv(sampleTsv);
    expect(parsed.lines.length).toBe(2);
    expect(parsed.lines[0]?.text).toBe('Hello World');
    expect(parsed.lines[0]?.bbox.x).toBe(10);
    expect(parsed.lines[0]?.bbox.y).toBe(20);
    expect(parsed.lines[0]?.confidence).toBeCloseTo(92.5, 5);
    expect(parsed.dropped_low_confidence).toBe(0);
  });

  test('drops low-confidence words and reports count', () => {
    const parsed = parseTesseractTsv(sampleTsv, { minConfidence: 50 });
    expect(parsed.lines.length).toBe(1);
    expect(parsed.lines[0]?.text).toBe('Hello World');
    expect(parsed.dropped_low_confidence).toBe(1);
  });

  test('includeWords returns word-level evidence', () => {
    const parsed = parseTesseractTsv(sampleTsv, { includeWords: true, minConfidence: 50 });
    expect(parsed.words.length).toBe(2);
    expect(parsed.words[0]?.text).toBe('Hello');
    expect(parsed.words[0]?.bbox.width).toBe(40);
  });
});
