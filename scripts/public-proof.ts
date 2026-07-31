#!/usr/bin/env bun
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Iris } from '../src/sdk.ts';
import { isTesseractAvailable } from '../src/utils/ocr.ts';

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
const base = await Iris.create().read({ path: sample });
const tesseract = isTesseractAvailable();
let ocr: unknown = null;
let ocrError: string | undefined;
if (tesseract) {
  try {
    ocr = await Iris.create().read({ path: sample, include_ocr: true } as { path: string; include_ocr: boolean });
  } catch (e) {
    ocrError = e instanceof Error ? e.message : String(e);
  }
}
const ms = performance.now() - started;

const text =
  Array.isArray(base)
    ? base.map((b: { text?: string }) => b.text ?? '').join('\n')
    : JSON.stringify(base);

const report = {
  product: 'Iris',
  sample,
  ms,
  ok: text.length > 0 || base != null,
  bytes: text.length,
  tesseractAvailable: tesseract,
  ocrAttempted: tesseract,
  ocrOk: tesseract ? ocr != null && !ocrError : null,
  ocrError,
  hasSkill: existsSync(join(root, 'skills/iris/SKILL.md')),
  generatedAt: new Date().toISOString(),
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'iris_public_proof.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
