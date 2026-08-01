/**
 * Local-first frontier optional vision caption.
 *
 * Priority:
 * 1) IRIS_OPTIONAL_LLM_URL — custom POST { path, mime, purpose } → { caption }
 * 2) Local Ollama at IRIS_OLLAMA_URL (default http://127.0.0.1:11434) if a vision model is installed
 *
 * Never authority over OCR/layout locators. OFF unless include_optional_llm=true.
 */

import { readFileSync } from 'node:fs';

export type OptionalLlmResult = {
  available: boolean;
  skipped_reason?: string;
  route?: string;
  caption?: string;
  model?: string;
};

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
];

function isVisionModel(name: string): boolean {
  const n = name.toLowerCase();
  return VISION_MODEL_HINTS.some((h) => n.includes(h));
}

async function tryCustomUrl(input: {
  path: string;
  mime: string;
  url: string;
}): Promise<OptionalLlmResult> {
  try {
    const res = await fetch(input.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        path: input.path,
        mime: input.mime,
        purpose: 'image_caption',
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return {
        available: false,
        skipped_reason: `optional LLM HTTP ${res.status}`,
        route: input.url,
      };
    }
    const body = (await res.json()) as { caption?: string };
    if (!body.caption || typeof body.caption !== 'string') {
      return {
        available: false,
        skipped_reason: 'optional LLM response missing caption string',
        route: input.url,
      };
    }
    return {
      available: true,
      route: `optional-llm:${input.url}`,
      caption: body.caption.slice(0, 4000),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'optional LLM failed';
    return { available: false, skipped_reason: message, route: input.url };
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

async function tryOllamaVision(input: {
  path: string;
  baseUrl: string;
  modelHint?: string;
}): Promise<OptionalLlmResult> {
  const base = input.baseUrl.replace(/\/$/, '');
  let models: string[] = [];
  try {
    models = await listOllamaModels(base);
  } catch {
    return {
      available: false,
      skipped_reason: `Ollama not reachable at ${base}`,
      route: base,
    };
  }
  if (models.length === 0) {
    return {
      available: false,
      skipped_reason: 'Ollama has no models installed',
      route: base,
    };
  }

  const preferred =
    (input.modelHint &&
      models.find((m) => m === input.modelHint || m.startsWith(`${input.modelHint}:`))) ||
    models.find((m) => isVisionModel(m));
  if (!preferred) {
    return {
      available: false,
      skipped_reason: `No local vision model found in Ollama (have: ${models.slice(0, 6).join(', ')}). Install e.g. llava or minicpm-v.`,
      route: base,
    };
  }

  let b64: string;
  try {
    b64 = readFileSync(input.path).toString('base64');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'read failed';
    return { available: false, skipped_reason: message, route: base };
  }

  // Cap image payload ~4MB base64
  if (b64.length > 5_500_000) {
    return {
      available: false,
      skipped_reason: 'image too large for default Ollama caption path; crop_region first',
      route: `ollama:${preferred}`,
    };
  }

  try {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: preferred,
        stream: false,
        messages: [
          {
            role: 'user',
            content:
              'Describe this image for a software agent. Focus on structure, UI/text regions, objects, and layout. Be concise and factual. Do not invent unreadable text.',
            images: [b64],
          },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      return {
        available: false,
        skipped_reason: `Ollama chat HTTP ${res.status}`,
        route: `ollama:${preferred}`,
        model: preferred,
      };
    }
    const body = (await res.json()) as {
      message?: { content?: string };
      response?: string;
    };
    const caption = body.message?.content ?? body.response;
    if (!caption || typeof caption !== 'string') {
      return {
        available: false,
        skipped_reason: 'Ollama response missing message content',
        route: `ollama:${preferred}`,
        model: preferred,
      };
    }
    return {
      available: true,
      route: `ollama-local-vlm:${preferred}`,
      model: preferred,
      caption: caption.slice(0, 4000),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Ollama caption failed';
    return {
      available: false,
      skipped_reason: message,
      route: `ollama:${preferred}`,
      model: preferred,
    };
  }
}

export async function maybeOptionalImageCaption(input: {
  path: string;
  mime: string;
  enabled: boolean;
}): Promise<OptionalLlmResult> {
  if (!input.enabled) {
    return { available: false, skipped_reason: 'include_optional_llm is false (default).' };
  }

  const custom = process.env['IRIS_OPTIONAL_LLM_URL'];
  if (custom) {
    return tryCustomUrl({ path: input.path, mime: input.mime, url: custom });
  }

  const ollamaBase = process.env['IRIS_OLLAMA_URL'] ?? process.env['OLLAMA_HOST'] ?? DEFAULT_OLLAMA;
  // OLLAMA_HOST may be host:port without scheme
  const baseUrl = ollamaBase.startsWith('http') ? ollamaBase : `http://${ollamaBase}`;
  const modelHint = process.env['IRIS_OLLAMA_VISION_MODEL'] ?? process.env['OLLAMA_VISION_MODEL'];

  return tryOllamaVision({
    path: input.path,
    baseUrl,
    ...(modelHint ? { modelHint } : {}),
  });
}
