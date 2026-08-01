import { spawnSync } from 'node:child_process';
import type { OcrLine } from '../schemas/readImage.js';

const OCR_HEALTHCHECK_TIMEOUT_MS = 2_500;
const OCR_TIMEOUT_MS = 60_000;

export interface OcrWord {
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
  confidence?: number;
}

/** Native Tesseract layout unit (block or paragraph) — frontier-local structure free with classic OCR. */
export interface OcrNativeBlock {
  id: string;
  kind: 'block' | 'paragraph';
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
  block_num?: number;
  par_num?: number;
  confidence?: number;
}

export interface OcrResult {
  available: boolean;
  skipped_reason?: string;
  /** Adapter route for evidence contract honesty */
  route?: string;
  languages?: string[];
  languages_warning?: string;
  line_count?: number;
  dropped_low_confidence?: number;
  lines: OcrLine[];
  words?: OcrWord[];
  /** Prefer for layout when present (Tesseract levels 2/3). */
  native_blocks?: OcrNativeBlock[];
}

export interface ParseTesseractOptions {
  minConfidence?: number;
  includeWords?: boolean;
}

const num = (v: string | undefined): number => Number.parseFloat(v ?? '');

/**
 * Pure TSV parser — lines (level 4 aggregated from words), words (level 5),
 * and native blocks/paragraphs (levels 2/3) for local-first layout frontier.
 */
export const parseTesseractTsv = (
  raw: string,
  options: ParseTesseractOptions = {}
): {
  lines: OcrLine[];
  words: OcrWord[];
  native_blocks: OcrNativeBlock[];
  dropped_low_confidence: number;
} => {
  const minConfidence = options.minConfidence ?? 0;
  const includeWords = options.includeWords ?? false;
  const linesRaw = raw.split(/\r?\n/).filter((line) => line.length > 0);
  if (linesRaw.length <= 1) {
    return { lines: [], words: [], native_blocks: [], dropped_low_confidence: 0 };
  }

  const rows = linesRaw.slice(1).map((line) => line.split('\t'));
  const lineMap = new Map<
    string,
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
  const nativeBlocks: OcrNativeBlock[] = [];

  for (const columns of rows) {
    if (columns.length < 12) continue;
    const level = Number.parseInt(columns[0] ?? '', 10);
    const blockNum = Number.parseInt(columns[2] ?? '', 10);
    const parNum = Number.parseInt(columns[3] ?? '', 10);
    const lineNum = Number.parseInt(columns[4] ?? '', 10);
    const left = Number.parseInt(columns[6] ?? '', 10);
    const top = Number.parseInt(columns[7] ?? '', 10);
    const width = Number.parseInt(columns[8] ?? '', 10);
    const height = Number.parseInt(columns[9] ?? '', 10);
    const conf = num(columns[10]);
    const text = columns[11]?.trim() ?? '';

    // Native layout units from Tesseract itself (better than pure heuristic when present)
    if ((level === 2 || level === 3) && Number.isFinite(left) && Number.isFinite(top)) {
      if (text.length > 0 || level === 2) {
        // level 2 blocks often have empty text; still keep geometry if non-zero
        if (width > 0 && height > 0) {
          const nb: OcrNativeBlock = {
            id: level === 2 ? `tess-block-${blockNum}` : `tess-par-${blockNum}-${parNum}`,
            kind: level === 2 ? 'block' : 'paragraph',
            text,
            bbox: {
              x: left,
              y: top,
              width: Number.isFinite(width) ? width : 0,
              height: Number.isFinite(height) ? height : 0,
            },
          };
          if (Number.isFinite(blockNum)) nb.block_num = blockNum;
          if (Number.isFinite(parNum)) nb.par_num = parNum;
          if (Number.isFinite(conf) && conf >= 0) nb.confidence = conf;
          nativeBlocks.push(nb);
        }
      }
    }

    if (level !== 5) continue;
    if (text.length === 0) continue;
    if (!Number.isFinite(lineNum) || !Number.isFinite(left) || !Number.isFinite(top)) continue;

    const confVal = Number.isFinite(conf) ? conf : 0;
    if (confVal < minConfidence) {
      dropped += 1;
      continue;
    }

    const lineKey = `${blockNum}:${parNum}:${lineNum}`;
    const bucket = lineMap.get(lineKey) ?? { words: [] };
    bucket.words.push({
      text,
      left,
      top,
      width: Number.isFinite(width) ? width : 0,
      height: Number.isFinite(height) ? height : 0,
      conf: confVal,
    });
    lineMap.set(lineKey, bucket);

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

  // Fill empty native block text from aggregated words in that block
  const wordsByBlock = new Map<number, string[]>();
  for (const [key, bucket] of lineMap) {
    const blockNum = Number.parseInt(key.split(':')[0] ?? '', 10);
    if (!Number.isFinite(blockNum)) continue;
    const list = wordsByBlock.get(blockNum) ?? [];
    const sorted = [...bucket.words].sort((a, b) => a.top - b.top || a.left - b.left);
    list.push(sorted.map((w) => w.text).join(' '));
    wordsByBlock.set(blockNum, list);
  }
  for (const block of nativeBlocks) {
    if (block.text.length > 0) continue;
    if (block.block_num === undefined) continue;
    const parts = wordsByBlock.get(block.block_num);
    if (parts && parts.length > 0) {
      block.text = parts.join('\n').trim();
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

  // Prefer paragraph native blocks with text; else blocks
  const paragraphs = nativeBlocks.filter((b) => b.kind === 'paragraph' && b.text.length > 0);
  const blocksOnly = nativeBlocks.filter((b) => b.kind === 'block');
  const preferredNative =
    paragraphs.length > 0
      ? paragraphs
      : blocksOnly.filter((b) => b.text.length > 0).length > 0
        ? blocksOnly.filter((b) => b.text.length > 0)
        : blocksOnly;

  return {
    lines: ocrLines.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x),
    words: includeWords ? flatWords.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x) : [],
    native_blocks: preferredNative.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x),
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

export const listTesseractLanguages = (): {
  available: boolean;
  languages: string[];
  warning?: string;
} => {
  if (!isTesseractAvailable()) {
    return {
      available: false,
      languages: [],
      warning: 'Tesseract is not installed or not available on PATH.',
    };
  }
  const result = spawnSync('tesseract', ['--list-langs'], {
    encoding: 'utf8',
    timeout: OCR_HEALTHCHECK_TIMEOUT_MS,
    windowsHide: true,
  });
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const languages = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.toLowerCase().includes('list of available'));
  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    return {
      available: false,
      languages: [],
      warning: stderr || 'tesseract --list-langs failed',
    };
  }
  return { available: true, languages };
};

export type RunOcrOptions = {
  languages?: string[];
  minConfidence?: number;
  includeWords?: boolean;
};

export const runTesseractOcr = (
  imagePath: string,
  languagesOrOptions: string[] | RunOcrOptions = ['eng']
): OcrResult => {
  const options: RunOcrOptions = Array.isArray(languagesOrOptions)
    ? { languages: languagesOrOptions }
    : languagesOrOptions;
  const languages = options.languages ?? ['eng'];
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
      native_blocks: [],
    };
  }

  const installed = listTesseractLanguages();
  const missingLangs = languages.filter(
    (lang) => installed.available && !installed.languages.includes(lang)
  );

  const languageArg = languages.join('+');
  const result = spawnSync(
    'tesseract',
    [imagePath, 'stdout', '-l', languageArg, 'tsv', '--psm', '3'],
    {
      encoding: 'utf8',
      timeout: OCR_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
    }
  );

  if (result.error) {
    return {
      available: false,
      skipped_reason: result.error.message,
      route: 'tesseract_tsv',
      languages,
      lines: [],
      line_count: 0,
      dropped_low_confidence: 0,
      native_blocks: [],
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
      native_blocks: [],
    };
  }

  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const parsed = parseTesseractTsv(stdout, { minConfidence, includeWords });
  return {
    available: true,
    route: 'tesseract_tsv_psm3_native_layout',
    languages,
    lines: parsed.lines,
    line_count: parsed.lines.length,
    dropped_low_confidence: parsed.dropped_low_confidence,
    native_blocks: parsed.native_blocks,
    ...(missingLangs.length
      ? {
          languages_warning: `Requested OCR language(s) not listed by tesseract --list-langs: ${missingLangs.join(', ')}. Installed: ${installed.languages.join(', ') || '(none)'}.`,
        }
      : {}),
    ...(includeWords ? { words: parsed.words } : {}),
  };
};
