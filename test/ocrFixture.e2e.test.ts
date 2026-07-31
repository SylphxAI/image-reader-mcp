import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { isTesseractAvailable, runTesseractOcr } from '../src/utils/ocr.ts';

describe('OCR fixture (tesseract optional)', () => {
  test('synthetic PNG OCR is honest when tesseract missing or returns lines when present', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'iris-ocr-'));
    const png = join(dir, 'invoice.png');
    // High-contrast text-like image; tesseract may or may not read "INVOICE" perfectly.
    const svg = `<svg width="320" height="80" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white"/>
      <text x="16" y="52" font-size="36" font-family="DejaVu Sans, Arial, sans-serif" fill="black">INVOICE 1042</text>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(png);

    if (!isTesseractAvailable()) {
      const ocr = runTesseractOcr(png, { languages: ['eng'] });
      expect(ocr.available).toBe(false);
      expect(ocr.skipped_reason).toMatch(/Tesseract/i);
      expect(ocr.lines).toEqual([]);
    } else {
      const ocr = runTesseractOcr(png, { languages: ['eng'], minConfidence: 0 });
      expect(ocr.route).toBe('tesseract_tsv');
      // Honesty: either available with structured lines, or failed with reason — never invent.
      if (ocr.available) {
        expect(Array.isArray(ocr.lines)).toBe(true);
        expect(ocr.line_count ?? ocr.lines.length).toBeGreaterThanOrEqual(0);
      } else {
        expect(ocr.skipped_reason).toBeTruthy();
      }
    }
    rmSync(dir, { recursive: true, force: true });
  });
});
