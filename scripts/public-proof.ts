#!/usr/bin/env bun
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Iris } from '../src/sdk.ts';
import { isTesseractAvailable } from '../src/utils/ocr.ts';

function unwrapTwin(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};
  const r = result as { type?: string; text?: string; content?: { type: string; text?: string }[] };
  let text: string | undefined;
  if (r.type === 'text' && typeof r.text === 'string') text = r.text;
  else if (Array.isArray(r.content)) text = r.content.find((c) => c.type === 'text')?.text;
  if (!text) return result as Record<string, unknown>;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

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
let ocrTwin: unknown = null;
let ocrError: string | undefined;
let ocrSummary: Record<string, unknown> | null = null;
if (tesseract) {
  try {
    ocrTwin = await Iris.create().read({
      path: sample,
      include_ocr: true,
      ocr_min_confidence: 0,
    } as { path: string; include_ocr: boolean; ocr_min_confidence: number });
    const twin = ocrTwin as {
      ocr?: {
        available?: boolean;
        route?: string;
        languages?: string[];
        line_count?: number;
        dropped_low_confidence?: number;
        lines?: unknown[];
      };
    };
    ocrSummary = {
      available: twin.ocr?.available ?? false,
      route: twin.ocr?.route,
      languages: twin.ocr?.languages,
      line_count: twin.ocr?.line_count ?? twin.ocr?.lines?.length ?? 0,
      dropped_low_confidence: twin.ocr?.dropped_low_confidence ?? 0,
    };
  } catch (e) {
    ocrError = e instanceof Error ? e.message : String(e);
  }
}
const ms = performance.now() - started;

const text =
  Array.isArray(base)
    ? base.map((b: { text?: string }) => b.text ?? '').join('\n')
    : JSON.stringify(base);

const twinBase = unwrapTwin(base);
const ocrUnwrapped = ocrTwin ? unwrapTwin(ocrTwin) : null;
if (ocrUnwrapped?.ocr && typeof ocrUnwrapped.ocr === 'object') {
  const o = ocrUnwrapped.ocr as Record<string, unknown>;
  ocrSummary = {
    available: o.available ?? false,
    route: o.route,
    languages: o.languages,
    line_count: o.line_count ?? (Array.isArray(o.lines) ? o.lines.length : 0),
    dropped_low_confidence: o.dropped_low_confidence ?? 0,
  };
}

const report = {
  product: 'Iris',
  sample,
  ms,
  ok: text.length > 0 || base != null,
  bytes: text.length,
  dimensions: twinBase.dimensions ?? null,
  trustWarnings: Array.isArray(twinBase.trust_warnings) ? twinBase.trust_warnings.length : 0,
  decodeRoute: Array.isArray(twinBase.trust_warnings)
    ? (twinBase.trust_warnings as string[]).find((w) => w.startsWith('Decode route:')) ?? null
    : null,
  tesseractAvailable: tesseract,
  ocrAttempted: tesseract,
  ocrOk: tesseract ? ocrTwin != null && !ocrError : null,
  ocrError,
  ocrSummary,
  ocrHonesty: tesseract
    ? 'tesseract present — OCR route reported when available'
    : 'tesseract absent — OCR skipped without invented text',
  hasSkill: existsSync(join(root, 'skills/iris/SKILL.md')),
  brandPublishDoc: existsSync(join(root, 'docs/BRAND_PUBLISH.md')),
  generatedAt: new Date().toISOString(),
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'iris_public_proof.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
