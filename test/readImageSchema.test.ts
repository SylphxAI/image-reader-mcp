import { describe, expect, it } from 'bun:test';
import { readImageArgsSchema } from '../src/schemas/readImage.js';

describe('readImageArgsSchema', () => {
  it('accepts a minimal valid payload', () => {
    const parsed = readImageArgsSchema.safeParse({ path: 'test/fixtures/sample.png' });
    expect(parsed.success).toBe(true);
  });

  it('rejects empty path', () => {
    const parsed = readImageArgsSchema.safeParse({ path: '' });
    expect(parsed.success).toBe(false);
  });

  it('rejects missing path', () => {
    const parsed = readImageArgsSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it('accepts optional OCR flags', () => {
    const parsed = readImageArgsSchema.safeParse({
      path: 'photo.jpg',
      include_metadata: false,
      include_ocr: true,
      ocr_languages: ['eng', 'deu'],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.include_ocr).toBe(true);
      expect(parsed.data.ocr_languages).toEqual(['eng', 'deu']);
    }
  });
});
