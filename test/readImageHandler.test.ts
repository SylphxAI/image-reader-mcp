import { beforeAll, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { readImage } from '../src/handlers/readImage.js';
import type { AgentMediaTwin } from '../src/schemas/readImage.js';

const fixtureDir = path.join(import.meta.dirname, 'fixtures');
const fixturePath = path.join(fixtureDir, 'sample.png');

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

beforeAll(async () => {
  await fs.mkdir(fixtureDir, { recursive: true });
  await sharp({
    create: {
      width: 32,
      height: 16,
      channels: 3,
      background: { r: 220, g: 40, b: 40 },
    },
  })
    .png()
    .toFile(fixturePath);
});

describe('readImage handler', () => {
  it('reads a local image and returns dimensions', async () => {
    const result = await readImage.handler({
      input: { path: fixturePath },
      ctx: {},
    });

    expect(result).not.toMatchObject({ isError: true });

    const twin = parseTwin(result);
    expect(twin.filename).toBe('sample.png');
    expect(twin.mime).toBe('image/png');
    expect(twin.dimensions).toEqual({ width: 32, height: 16 });
    expect(Array.isArray(twin.trust_warnings)).toBe(true);
  });

  it('reports when no embedded metadata is present', async () => {
    const result = await readImage.handler({
      input: { path: fixturePath, include_metadata: true },
      ctx: {},
    });

    const twin = parseTwin(result);
    expect(
      twin.trust_warnings.some((warning) => warning.includes('No EXIF, XMP, or IPTC metadata'))
    ).toBe(true);
  });

  it('returns an error for missing files', async () => {
    const missingPath = path.join(fixtureDir, 'does-not-exist.png');
    const result = await readImage.handler({
      input: { path: missingPath },
      ctx: {},
    });

    expect(result).toMatchObject({ isError: true });
  });

  it('includes OCR status when requested', async () => {
    const result = await readImage.handler({
      input: { path: fixturePath, include_ocr: true },
      ctx: {},
    });

    const twin = parseTwin(result);
    expect(twin.ocr).toBeDefined();
    expect(typeof twin.ocr?.available).toBe('boolean');
    expect(Array.isArray(twin.ocr?.lines)).toBe(true);
  });
});
