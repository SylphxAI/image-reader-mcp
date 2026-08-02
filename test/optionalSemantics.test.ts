import { afterEach, describe, expect, test } from 'bun:test';
import { maybeImageSemantics } from '../src/utils/optionalSemantics.js';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
  delete process.env.IRIS_SEMANTICS_URL;
  delete process.env.IRIS_OLLAMA_URL;
  delete process.env.OLLAMA_HOST;
  delete process.env.IRIS_OLLAMA_VISION_MODEL;
});

describe('Iris L2 optionalSemantics', () => {
  test('default include false returns undefined', async () => {
    const r = await maybeImageSemantics({
      path: '/tmp/x.png',
      mime: 'image/png',
      width: 100,
      height: 80,
      include: false,
    });
    expect(r).toBeUndefined();
  });

  test('HTTP adapter returns normalized objects and caption', async () => {
    process.env.IRIS_SEMANTICS_URL = 'http://127.0.0.1:9/semantics';
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          model: 'florence2-mock',
          caption: 'A person walking a dog',
          objects: [
            { label: 'person', bbox: { x: 10, y: 20, width: 30, height: 40 }, score: 0.91 },
            { label: 'dog', bbox: { x: 50, y: 60, width: 25, height: 20 }, score: 88 },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )) as typeof fetch;

    const r = await maybeImageSemantics({
      path: '/tmp/x.png',
      mime: 'image/png',
      width: 200,
      height: 200,
      include: true,
    });
    expect(r?.available).toBe(true);
    expect(r?.authority).toBe('scored_non_locator');
    expect(r?.object_count).toBe(2);
    expect(r?.objects?.[0]?.label).toBe('person');
    expect(r?.objects?.[0]?.bbox).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    // score 88 treated as percent → 0.88
    expect(r?.objects?.[1]?.score).toBeCloseTo(0.88, 5);
    expect(r?.caption).toContain('dog');
    expect(r?.route).toContain('iris-semantics-http');
  });

  test('HTTP failure with include true is honest unavailable', async () => {
    process.env.IRIS_SEMANTICS_URL = 'http://127.0.0.1:9/semantics';
    // No Ollama either
    process.env.IRIS_OLLAMA_URL = 'http://127.0.0.1:1';
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/semantics')) {
        return new Response('nope', { status: 503 });
      }
      return new Response('down', { status: 500 });
    }) as typeof fetch;

    const r = await maybeImageSemantics({
      path: '/tmp/x.png',
      mime: 'image/png',
      width: 10,
      height: 10,
      include: true,
    });
    expect(r?.available).toBe(false);
    expect(r?.skipped_reason).toMatch(/503|failed|unavailable|Ollama|semantics/i);
  });
});
