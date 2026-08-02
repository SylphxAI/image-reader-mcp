/**
 * Iris L2 local semantics — open-vocab objects + optional caption.
 *
 * Priority:
 * 1) IRIS_SEMANTICS_URL — Florence/Grounding-DINO/SAM-class adapter
 * 2) Local Ollama vision with structured JSON objects
 *
 * Authority: scored_non_locator — never overrides OCR/layout locators.
 * Default OFF (include_semantics false) for zero-config surprise control.
 */

import { readFileSync } from 'node:fs';

export type SemanticsBBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SemanticsObject = {
  id: string;
  label: string;
  category?: string | undefined;
  bbox?: SemanticsBBox | undefined;
  score?: number | undefined;
  mask_ref?: string | null | undefined;
};

export type SemanticsResult = {
  available: boolean;
  authority: 'scored_non_locator';
  skipped_reason?: string | undefined;
  route?: string | undefined;
  model?: string | undefined;
  caption?: string | undefined;
  object_count?: number | undefined;
  objects?: SemanticsObject[] | undefined;
  warnings?: string[] | undefined;
};

export type IncludeSemantics = boolean | 'auto';

const DEFAULT_OLLAMA = 'http://127.0.0.1:11434';

const VISION_MODEL_HINTS = [
  'llava',
  'minicpm-v',
  'minicpm_v',
  'qwen2-vl',
  'qwen2.5-vl',
  'qwen3-vl',
  'bakllava',
  'moondream',
  'gemma3',
  'llama3.2-vision',
  'pixtral',
  'florence',
];

function isVisionModel(name: string): boolean {
  const n = name.toLowerCase();
  return VISION_MODEL_HINTS.some((h) => n.includes(h));
}

function clampBBox(
  raw: Partial<SemanticsBBox> | undefined,
  maxW: number,
  maxH: number
): SemanticsBBox | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const x = Number(raw.x);
  const y = Number(raw.y);
  const width = Number(raw.width);
  const height = Number(raw.height);
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return undefined;
  if (width <= 0 || height <= 0) return undefined;
  const cx = Math.max(0, Math.min(maxW, Math.round(x)));
  const cy = Math.max(0, Math.min(maxH, Math.round(y)));
  const cw = Math.max(1, Math.min(maxW - cx, Math.round(width)));
  const ch = Math.max(1, Math.min(maxH - cy, Math.round(height)));
  return { x: cx, y: cy, width: cw, height: ch };
}

function parseScore(scoreRaw: unknown): number | undefined {
  if (typeof scoreRaw !== 'number' || !Number.isFinite(scoreRaw)) return undefined;
  return Math.max(0, Math.min(1, scoreRaw > 1 ? scoreRaw / 100 : scoreRaw));
}

function parseObjectItem(
  item: unknown,
  index: number,
  maxW: number,
  maxH: number,
  warnings: string[]
): SemanticsObject | undefined {
  if (!item || typeof item !== 'object') return undefined;
  const rec = item as Record<string, unknown>;
  const label = typeof rec['label'] === 'string' ? rec['label'].trim() : '';
  if (!label) return undefined;
  const score = parseScore(rec['score'] ?? rec['confidence']);
  const bbox = clampBBox(rec['bbox'] as Partial<SemanticsBBox> | undefined, maxW, maxH);
  if (rec['bbox'] && !bbox) warnings.push(`dropped invalid bbox for ${label}`);
  const id = typeof rec['id'] === 'string' && rec['id'] ? rec['id'] : `obj_${index}`;
  const category = typeof rec['category'] === 'string' ? rec['category'].slice(0, 64) : undefined;
  const maskRaw = rec['mask_ref'];
  const mask_ref = typeof maskRaw === 'string' ? maskRaw : maskRaw === null ? null : undefined;
  return {
    id,
    label: label.slice(0, 128),
    ...(category !== undefined ? { category } : {}),
    ...(bbox ? { bbox } : {}),
    ...(score !== undefined ? { score } : {}),
    ...(mask_ref !== undefined ? { mask_ref } : {}),
  };
}

function normalizeObjects(
  objects: unknown,
  maxW: number,
  maxH: number
): { objects: SemanticsObject[]; warnings: string[] } {
  const warnings: string[] = [];
  if (!Array.isArray(objects)) {
    return { objects: [], warnings: ['semantics objects missing or not an array'] };
  }
  const out: SemanticsObject[] = [];
  let i = 0;
  for (const item of objects.slice(0, 64)) {
    i += 1;
    const obj = parseObjectItem(item, i, maxW, maxH, warnings);
    if (obj) out.push(obj);
  }
  return { objects: out, warnings };
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('no JSON object in model response');
  }
}

async function tryHttpSemantics(input: {
  path: string;
  mime: string;
  url: string;
  prompt?: string | undefined;
  width: number;
  height: number;
}): Promise<SemanticsResult> {
  try {
    const res = await fetch(input.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        path: input.path,
        mime: input.mime,
        purpose: 'image_semantics',
        prompt: input.prompt,
        dimensions: { width: input.width, height: input.height },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      return {
        available: false,
        authority: 'scored_non_locator',
        skipped_reason: `semantics HTTP ${res.status}`,
        route: input.url,
      };
    }
    const body = (await res.json()) as {
      caption?: string;
      model?: string;
      objects?: unknown;
      warnings?: string[];
    };
    const { objects, warnings } = normalizeObjects(body.objects ?? [], input.width, input.height);
    const caption = typeof body.caption === 'string' ? body.caption.slice(0, 4000) : undefined;
    if (objects.length === 0 && !caption) {
      return {
        available: false,
        authority: 'scored_non_locator',
        skipped_reason: 'semantics HTTP response had no objects or caption',
        route: input.url,
        model: body.model,
        warnings,
      };
    }
    return {
      available: true,
      authority: 'scored_non_locator',
      route: `iris-semantics-http:${input.url}`,
      model: body.model,
      caption,
      object_count: objects.length,
      objects,
      warnings: [...warnings, ...(Array.isArray(body.warnings) ? body.warnings.map(String) : [])],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'semantics HTTP failed';
    return {
      available: false,
      authority: 'scored_non_locator',
      skipped_reason: message,
      route: input.url,
    };
  }
}

async function listOllamaModels(base: string): Promise<string[]> {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/tags`, {
    signal: AbortSignal.timeout(3_000),
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { models?: Array<{ name?: string }> };
  return (body.models ?? [])
    .map((m) => m.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0);
}

async function tryOllamaStructured(input: {
  path: string;
  baseUrl: string;
  width: number;
  height: number;
  prompt?: string | undefined;
  modelHint?: string | undefined;
}): Promise<SemanticsResult> {
  const base = input.baseUrl.replace(/\/$/, '');
  try {
    const models = await listOllamaModels(base);
    const preferred =
      input.modelHint && models.includes(input.modelHint)
        ? input.modelHint
        : models.find(isVisionModel);
    if (!preferred) {
      return {
        available: false,
        authority: 'scored_non_locator',
        skipped_reason: 'no local Ollama vision model for structured semantics',
        route: `ollama:${base}`,
      };
    }

    const bytes = readFileSync(input.path);
    // Keep payloads modest for local VLM
    if (bytes.byteLength > 8_000_000) {
      return {
        available: false,
        authority: 'scored_non_locator',
        skipped_reason: 'image too large for default Ollama semantics path; crop_region first',
        route: `ollama:${preferred}`,
        model: preferred,
      };
    }
    const b64 = bytes.toString('base64');
    const focus = input.prompt?.trim() ? ` Focus: ${input.prompt.trim().slice(0, 200)}.` : '';
    const system = `You extract structured visual evidence for software agents.
Image size is ${input.width}x${input.height} pixels (x right, y down).
Return ONLY a JSON object (no markdown) with shape:
{"caption":"short factual caption","objects":[{"label":"person|dog|car|…","category":"optional","bbox":{"x":0,"y":0,"width":10,"height":10},"score":0.0}]}
Rules: bbox in pixels for the full image; invent nothing unreadable; empty objects array if unsure; max 24 objects; scores 0..1.${focus}`;

    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: preferred,
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: 'Extract objects and caption from this image as JSON.',
            images: [b64],
          },
        ],
        options: { temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      return {
        available: false,
        authority: 'scored_non_locator',
        skipped_reason: `ollama chat HTTP ${res.status}`,
        route: `ollama:${preferred}`,
        model: preferred,
      };
    }
    const body = (await res.json()) as {
      message?: { content?: string };
      response?: string;
    };
    const text = body.message?.content ?? body.response;
    if (!text || typeof text !== 'string') {
      return {
        available: false,
        authority: 'scored_non_locator',
        skipped_reason: 'ollama response missing content',
        route: `ollama-structured:${preferred}`,
        model: preferred,
      };
    }
    const parsed = extractJsonObject(text) as {
      caption?: string;
      objects?: unknown;
    };
    const { objects, warnings } = normalizeObjects(parsed.objects ?? [], input.width, input.height);
    const caption = typeof parsed.caption === 'string' ? parsed.caption.slice(0, 4000) : undefined;
    if (objects.length === 0 && !caption) {
      return {
        available: false,
        authority: 'scored_non_locator',
        skipped_reason: 'structured VLM returned no objects or caption',
        route: `ollama-structured:${preferred}`,
        model: preferred,
        warnings,
      };
    }
    return {
      available: true,
      authority: 'scored_non_locator',
      route: `ollama-structured:${preferred}`,
      model: preferred,
      caption,
      object_count: objects.length,
      objects,
      warnings,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'ollama semantics failed';
    return {
      available: false,
      authority: 'scored_non_locator',
      skipped_reason: message,
      route: `ollama:${base}`,
    };
  }
}

export async function maybeImageSemantics(input: {
  path: string;
  mime: string;
  width: number;
  height: number;
  include: IncludeSemantics | undefined;
  prompt?: string | undefined;
}): Promise<SemanticsResult | undefined> {
  const flag = input.include ?? false;
  if (flag === false) return undefined;

  const httpUrl = process.env['IRIS_SEMANTICS_URL']?.trim();
  if (httpUrl) {
    const http = await tryHttpSemantics({
      path: input.path,
      mime: input.mime,
      url: httpUrl,
      prompt: input.prompt,
      width: input.width,
      height: input.height,
    });
    if (http.available) return http;
    // Prefer explicit HTTP error when URL is set and mode is true
    if (flag === true) return http;
  }

  const ollamaBase = process.env['IRIS_OLLAMA_URL'] ?? process.env['OLLAMA_HOST'] ?? DEFAULT_OLLAMA;
  const baseUrl = ollamaBase.startsWith('http') ? ollamaBase : `http://${ollamaBase}`;
  const modelHint = process.env['IRIS_OLLAMA_VISION_MODEL']?.trim();
  const ollama = await tryOllamaStructured({
    path: input.path,
    baseUrl,
    width: input.width,
    height: input.height,
    prompt: input.prompt,
    modelHint,
  });
  if (ollama.available) return ollama;

  return {
    available: false,
    authority: 'scored_non_locator',
    skipped_reason:
      ollama.skipped_reason ??
      (httpUrl
        ? 'semantics backends unavailable'
        : 'no IRIS_SEMANTICS_URL and no local Ollama vision model'),
    route: ollama.route,
    model: ollama.model,
  };
}
