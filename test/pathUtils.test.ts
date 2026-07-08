import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { ErrorCode, ImageError } from '../src/utils/errors.js';
import { PROJECT_ROOT, resolvePath } from '../src/utils/pathUtils.js';

const canonicalize = (p: string): string => {
  try {
    return fs.realpathSync(p);
  } catch {
    const parent = path.dirname(p);
    if (parent === p) return p;
    return path.join(canonicalize(parent), path.basename(p));
  }
};

describe('resolvePath', () => {
  it('resolves relative paths against cwd', () => {
    const userPath = 'some/file.png';
    const expectedPath = canonicalize(path.resolve(PROJECT_ROOT, userPath));
    expect(resolvePath(userPath)).toBe(expectedPath);
  });

  it('accepts absolute paths', () => {
    const userPath = path.resolve(PROJECT_ROOT, 'absolute/file.png');
    expect(resolvePath(userPath)).toBe(canonicalize(userPath));
  });

  it('throws ImageError for non-string input', () => {
    const userPath = 123 as unknown as string;
    expect(() => resolvePath(userPath)).toThrow(ImageError);
    try {
      resolvePath(userPath);
    } catch (error) {
      expect(error).toBeInstanceOf(ImageError);
      expect((error as ImageError).code).toBe(ErrorCode.InvalidParams);
    }
  });
});
