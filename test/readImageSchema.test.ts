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
      path: 'test/fixtures/sample.png',
      include_ocr: true,
      include_ocr_words: true,
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts include_semantics and semantics_prompt', () => {
    const parsed = readImageArgsSchema.safeParse({
      path: '/tmp/a.png',
      include_semantics: true,
      semantics_prompt: 'animals',
    });
    expect(parsed.success).toBe(true);
    const auto = readImageArgsSchema.safeParse({ path: '/tmp/a.png', include_semantics: 'auto' });
    expect(auto.success).toBe(true);
  });
});
