import { describe, expect, it } from 'bun:test';
import { ImageError } from '../src/utils/errors.js';
import { IMAGE_SAFETY_LIMITS, validateImageSafety } from '../src/utils/safety.js';

describe('image safety limits', () => {
  it('rejects files above the byte budget', () => {
    expect(() =>
      validateImageSafety({ fileSizeBytes: IMAGE_SAFETY_LIMITS.maxFileBytes + 1 })
    ).toThrow(ImageError);
  });

  it('rejects images above the pixel budget', () => {
    expect(() =>
      validateImageSafety({
        fileSizeBytes: 1024,
        width: 16_384,
        height: 16_384,
      })
    ).toThrow(ImageError);
  });

  it('allows images within both budgets', () => {
    expect(() =>
      validateImageSafety({
        fileSizeBytes: 1024,
        width: 32,
        height: 16,
      })
    ).not.toThrow();
  });
});
