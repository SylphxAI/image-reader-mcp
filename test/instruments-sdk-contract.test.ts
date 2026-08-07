import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');

describe('Iris Instruments product contract', () => {
  test('sdk source and package exports/bin brand-sole exist', () => {
    expect(existsSync(join(root, 'src/sdk.ts'))).toBe(true);
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      name?: string;
      exports?: Record<string, string>;
      bin?: Record<string, string>;
    };
    expect(pkg.name).toBe('@sylphx/iris');
    expect(pkg.exports?.['./sdk']).toBeTruthy();
    expect(pkg.bin?.iris).toBeTruthy();
    const sdk = readFileSync(join(root, 'src/sdk.ts'), 'utf8');
    expect(sdk).toContain('export class Iris');
    expect(sdk).toContain('read_image');
  });

  test('marketplace server.json brands as Iris (brand-sole)', () => {
    const server = JSON.parse(readFileSync(join(root, 'server.json'), 'utf8')) as {
      title?: string;
      name?: string;
      packages?: { identifier?: string }[];
    };
    expect(server.title).toBe('Iris');
    expect(server.name).toBe('io.github.SylphxAI/iris');
    expect(server.packages?.[0]?.identifier).toBe('@sylphx/iris');
  });

  test('sample fixture exists for local read tests', () => {
    expect(existsSync(join(root, 'test/fixtures/sample.png'))).toBe(true);
  });
});
