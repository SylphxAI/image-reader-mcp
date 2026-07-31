import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');

describe('Iris Instruments product contract', () => {
  test('sdk source and package exports/bin brand alias exist', () => {
    expect(existsSync(join(root, 'src/sdk.ts'))).toBe(true);
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      exports?: Record<string, string>;
      bin?: Record<string, string>;
    };
    expect(pkg.exports?.['./sdk']).toBeTruthy();
    expect(pkg.exports?.['./iris']).toBeTruthy();
    expect(pkg.bin?.iris).toBeTruthy();
    expect(pkg.bin?.['image-reader-mcp']).toBeTruthy();
    const sdk = readFileSync(join(root, 'src/sdk.ts'), 'utf8');
    expect(sdk).toContain('export class Iris');
    expect(sdk).toContain('read_image');
  });

  test('marketplace server.json brands as Iris', () => {
    const server = JSON.parse(readFileSync(join(root, 'server.json'), 'utf8')) as {
      title?: string;
      name?: string;
    };
    expect(server.title).toBe('Iris');
    expect(server.name).toContain('image-reader-mcp');
  });

  test('sample fixture exists for local read tests', () => {
    expect(existsSync(join(root, 'test/fixtures/sample.png'))).toBe(true);
  });
});
