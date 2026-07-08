import { spawnSync } from 'node:child_process';
import type { OcrLine } from '../schemas/readImage.js';

const OCR_HEALTHCHECK_TIMEOUT_MS = 2_500;
const OCR_TIMEOUT_MS = 60_000;

interface OcrResult {
  available: boolean;
  skipped_reason?: string;
  lines: OcrLine[];
}

const parseTesseractTsv = (raw: string): OcrLine[] => {
  const lines = raw.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length <= 1) return [];

  const rows = lines.slice(1).map((line) => line.split('\t'));
  const lineMap = new Map<
    number,
    {
      words: Array<{
        text: string;
        left: number;
        top: number;
        width: number;
        height: number;
        conf: number;
      }>;
    }
  >();

  for (const columns of rows) {
    if (columns.length < 12) continue;
    const level = Number.parseInt(columns[0] ?? '', 10);
    if (level !== 5) continue;

    const text = columns[11]?.trim() ?? '';
    if (text.length === 0) continue;

    const lineNum = Number.parseInt(columns[4] ?? '', 10);
    const left = Number.parseInt(columns[6] ?? '', 10);
    const top = Number.parseInt(columns[7] ?? '', 10);
    const width = Number.parseInt(columns[8] ?? '', 10);
    const height = Number.parseInt(columns[9] ?? '', 10);
    const conf = Number.parseFloat(columns[10] ?? '');

    if (!Number.isFinite(lineNum) || !Number.isFinite(left) || !Number.isFinite(top)) continue;

    const bucket = lineMap.get(lineNum) ?? { words: [] };
    bucket.words.push({
      text,
      left,
      top,
      width: Number.isFinite(width) ? width : 0,
      height: Number.isFinite(height) ? height : 0,
      conf: Number.isFinite(conf) ? conf : 0,
    });
    lineMap.set(lineNum, bucket);
  }

  const ocrLines: OcrLine[] = [];

  for (const bucket of lineMap.values()) {
    if (bucket.words.length === 0) continue;

    const sorted = [...bucket.words].sort((a, b) => a.left - b.left);
    const text = sorted
      .map((word) => word.text)
      .join(' ')
      .trim();
    if (text.length === 0) continue;

    const left = Math.min(...sorted.map((word) => word.left));
    const top = Math.min(...sorted.map((word) => word.top));
    const right = Math.max(...sorted.map((word) => word.left + word.width));
    const bottom = Math.max(...sorted.map((word) => word.top + word.height));
    const confidenceValues = sorted.map((word) => word.conf).filter((value) => value >= 0);
    const confidence =
      confidenceValues.length > 0
        ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
        : undefined;

    ocrLines.push({
      text,
      bbox: {
        x: left,
        y: top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      },
      ...(confidence !== undefined ? { confidence } : {}),
    });
  }

  return ocrLines.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
};

export const isTesseractAvailable = (): boolean => {
  const result = spawnSync('tesseract', ['--version'], {
    timeout: OCR_HEALTHCHECK_TIMEOUT_MS,
    windowsHide: true,
    stdio: 'ignore',
  });
  return result.status === 0;
};

export const runTesseractOcr = (imagePath: string, languages: string[]): OcrResult => {
  if (!isTesseractAvailable()) {
    return {
      available: false,
      skipped_reason: 'Tesseract is not installed or not available on PATH.',
      lines: [],
    };
  }

  const languageArg = languages.length > 0 ? languages.join('+') : 'eng';
  const result = spawnSync('tesseract', [imagePath, 'stdout', '-l', languageArg, 'tsv'], {
    encoding: 'utf8',
    timeout: OCR_TIMEOUT_MS,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    return {
      available: false,
      skipped_reason: `Tesseract failed to start: ${result.error.message}`,
      lines: [],
    };
  }

  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    return {
      available: false,
      skipped_reason:
        stderr.length > 0 ? stderr : `Tesseract exited with status ${String(result.status)}.`,
      lines: [],
    };
  }

  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  return {
    available: true,
    lines: parseTesseractTsv(stdout),
  };
};
