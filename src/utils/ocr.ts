import { spawnSync } from 'node:child_process';
import type { OcrLine } from '../schemas/readImage.js';

const OCR_HEALTHCHECK_TIMEOUT_MS = 2_500;
const OCR_TIMEOUT_MS = 60_000;

export interface OcrWord {
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
  confidence?: number;
}

export interface OcrResult {
  available: boolean;
  skipped_reason?: string;
  /** Adapter route for evidence contract honesty */
  route?: string;
  languages?: string[];
  line_count?: number;
  dropped_low_confidence?: number;
  lines: OcrLine[];
  words?: OcrWord[];
}

export interface ParseTesseractOptions {
  minConfidence?: number;
  includeWords?: boolean;
}

/** Pure TSV parser — offline-testable evidence path for OCR bbox lines. */
export const parseTesseractTsv = (
  raw: string,
  options: ParseTesseractOptions = {},
): { lines: OcrLine[]; words: OcrWord[]; dropped_low_confidence: number } => {
  const minConfidence = options.minConfidence ?? 0;
  const includeWords = options.includeWords ?? false;
  const linesRaw = raw.split(/\r?\n/).filter((line) => line.length > 0);
  if (linesRaw.length <= 1) {
    return { lines: [], words: [], dropped_low_confidence: 0 };
  }

  const rows = linesRaw.slice(1).map((line) => line.split('\t'));
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

  let dropped = 0;
  const flatWords: OcrWord[] = [];

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

    const confVal = Number.isFinite(conf) ? conf : 0;
    if (confVal < minConfidence) {
      dropped += 1;
      continue;
    }

    const bucket = lineMap.get(lineNum) ?? { words: [] };
    bucket.words.push({
      text,
      left,
      top,
      width: Number.isFinite(width) ? width : 0,
      height: Number.isFinite(height) ? height : 0,
      conf: confVal,
    });
    lineMap.set(lineNum, bucket);

    if (includeWords) {
      flatWords.push({
        text,
        bbox: {
          x: left,
          y: top,
          width: Number.isFinite(width) ? width : 0,
          height: Number.isFinite(height) ? height : 0,
        },
        confidence: confVal,
      });
    }
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

  return {
    lines: ocrLines.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x),
    words: includeWords
      ? flatWords.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x)
      : [],
    dropped_low_confidence: dropped,
  };
};

export const isTesseractAvailable = (): boolean => {
  const result = spawnSync('tesseract', ['--version'], {
    timeout: OCR_HEALTHCHECK_TIMEOUT_MS,
    windowsHide: true,
    stdio: 'ignore',
  });
  return result.status === 0;
};

export type RunOcrOptions = {
  languages?: string[];
  minConfidence?: number;
  includeWords?: boolean;
};

export const runTesseractOcr = (
  imagePath: string,
  languagesOrOptions: string[] | RunOcrOptions = ['eng'],
): OcrResult => {
  const options: RunOcrOptions = Array.isArray(languagesOrOptions)
    ? { languages: languagesOrOptions }
    : languagesOrOptions;
  const languages = options.languages?.length ? options.languages : ['eng'];
  const minConfidence = options.minConfidence ?? 0;
  const includeWords = options.includeWords ?? false;

  if (!isTesseractAvailable()) {
    return {
      available: false,
      skipped_reason: 'Tesseract is not installed or not available on PATH.',
      route: 'tesseract_tsv',
      languages,
      lines: [],
      line_count: 0,
      dropped_low_confidence: 0,
    };
  }

  const languageArg = languages.join('+');
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
      route: 'tesseract_tsv',
      languages,
      lines: [],
      line_count: 0,
      dropped_low_confidence: 0,
    };
  }

  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    return {
      available: false,
      skipped_reason:
        stderr.length > 0 ? stderr : `Tesseract exited with status ${String(result.status)}.`,
      route: 'tesseract_tsv',
      languages,
      lines: [],
      line_count: 0,
      dropped_low_confidence: 0,
    };
  }

  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const parsed = parseTesseractTsv(stdout, { minConfidence, includeWords });
  return {
    available: true,
    route: 'tesseract_tsv',
    languages,
    lines: parsed.lines,
    line_count: parsed.lines.length,
    dropped_low_confidence: parsed.dropped_low_confidence,
    ...(includeWords ? { words: parsed.words } : {}),
  };
};
