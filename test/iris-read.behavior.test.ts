import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { Iris } from '../src/sdk.ts';

const sample = join(import.meta.dir, 'fixtures/sample.png');

describe('Iris read behavior', () => {
  test('reads sample.png into citeable media twin JSON text', async () => {
    const iris = Iris.create();
    const result = await iris.read({ path: sample });
    // Tool returns CallToolResult or content blocks
    const text =
      result && typeof result === 'object' && 'content' in result
        ? // MCP shaped
          (result as { content?: { type: string; text?: string }[] }).content?.find(
            (c) => c.type === 'text',
          )?.text
        : typeof result === 'object' && result !== null && 'type' in result
          ? (result as { text?: string }).text
          : Array.isArray(result)
            ? (result as { type: string; text?: string }[]).find((c) => c.type === 'text')?.text
            : undefined;

    // Also accept plain text content block array
    let body = text;
    if (!body && Array.isArray(result)) {
      body = (result as { text?: string }[])[0]?.text;
    }
    expect(body).toBeTruthy();
    const twin = JSON.parse(body as string) as {
      dimensions?: { width?: number; height?: number };
      path?: string;
      trust_warnings?: unknown;
    };
    expect(twin.dimensions?.width).toBeGreaterThan(0);
    expect(twin.dimensions?.height).toBeGreaterThan(0);
  }, 30_000);
});
