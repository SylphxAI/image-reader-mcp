#!/usr/bin/env bun
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Iris } from '../src/sdk.ts';

const root = join(import.meta.dir, '..');
const sample = join(root, 'test/fixtures/sample.png');
const outDir = process.env.MCP_IMAGE_BENCHMARK_OUTPUT_DIR
  ? join(root, process.env.MCP_IMAGE_BENCHMARK_OUTPUT_DIR)
  : join(root, 'benchmark-artifacts');

if (!existsSync(sample)) {
  console.error('missing sample.png');
  process.exit(1);
}

const started = performance.now();
const result = await Iris.create().read({ path: sample });
const ms = performance.now() - started;

// result is MCP content-ish; keep honest shape
const text =
  Array.isArray(result)
    ? result.map((b: { text?: string }) => b.text ?? '').join('\n')
    : typeof result === 'object' && result && 'content' in (result as object)
      ? JSON.stringify(result)
      : JSON.stringify(result);

const report = {
  product: 'Iris',
  sample,
  ms,
  ok: text.length > 0 || result != null,
  bytes: text.length,
  hasSkill: existsSync(join(root, 'skills/iris/SKILL.md')),
  generatedAt: new Date().toISOString(),
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'iris_public_proof.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
