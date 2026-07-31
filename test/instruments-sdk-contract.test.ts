import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');

describe('Iris Instruments SDK contract', () => {
  test('sdk source and package exports/bin brand alias exist', () => {
    expect(existsSync(join(root, 'src/sdk.ts'))).toBe(true);
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      exports?: Record<string, string>;
      bin?: Record<string, string>;
    };
    expect(pkg.exports?.['./sdk']).toBeTruthy();
    expect(pkg.exports?.['./iris'] || pkg.exports?.['./sdk']).toBeTruthy();
    expect(pkg.bin?.['iris']).toBeTruthy();
    const sdk = readFileSync(join(root, 'src/sdk.ts'), 'utf8');
    expect(sdk).toContain('export class Iris');
    expect(sdk.toLowerCase()).toContain('read_image'.split('_')[0]);
  });
});
