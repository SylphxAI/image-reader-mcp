import { beforeAll, afterAll, describe, expect, it } from 'bun:test';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { readImage } from '../src/handlers/readImage.js';
import type { AgentMediaTwin } from '../src/schemas/readImage.js';

const repoRoot = path.resolve(import.meta.dirname, '..');
const fixturePath = path.join(import.meta.dirname, 'fixtures', 'sample.png');

const parseTwin = (result: Awaited<ReturnType<typeof readImage.handler>>): AgentMediaTwin => {
  const block =
    'type' in result && result.type === 'text'
      ? result
      : 'content' in result && Array.isArray(result.content)
        ? result.content[0]
        : undefined;

  if (block?.type !== 'text') {
    throw new Error('Expected text content from read_image handler');
  }

  return JSON.parse(block.text) as AgentMediaTwin;
};

describe('rust decode engine boundary', () => {
  beforeAll(() => {
    execSync('cargo build -q', { cwd: repoRoot, stdio: 'pipe', timeout: 120_000 });
    process.env['IMAGE_READER_USE_RUST_DECODE'] = '1';
  }, 120_000);

  afterAll(() => {
    delete process.env['IMAGE_READER_USE_RUST_DECODE'];
  });

  it('delegates dimension and format probing to the Rust CLI', async () => {
    const result = await readImage.handler({
      input: { path: fixturePath, include_metadata: false },
      ctx: {},
    });

    expect(result).not.toMatchObject({ isError: true });
    const twin = parseTwin(result);
    expect(twin.mime).toBe('image/png');
    expect(twin.dimensions).toEqual({ width: 32, height: 16 });
    expect(twin.trust_warnings.some((warning) => warning.includes('rust-probe'))).toBe(true);
  });

  it('keeps decode logic out of the TypeScript adapter sources', async () => {
    const { readFileSync } = await import('node:fs');
    const handlerSrc = readFileSync(path.join(repoRoot, 'src/handlers/readImage.ts'), 'utf8');
    const engineSrc = readFileSync(path.join(repoRoot, 'src/engine/rust-decode.ts'), 'utf8');

    expect(engineSrc).toContain('spawnSync');
    expect(handlerSrc).toContain('probeImageViaRustEngine');
    expect(handlerSrc).not.toMatch(/sha256|ImageReader|guess_format/i);
  });
});