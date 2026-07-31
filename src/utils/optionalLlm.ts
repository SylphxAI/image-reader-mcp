/**
 * Optional local/remote vision caption — OFF by default (local-first).
 * Set IRIS_OPTIONAL_LLM_URL to a POST endpoint that accepts JSON
 * { path, mime, purpose: "image_caption" } and returns { caption: string }.
 * Never treated as authority over OCR/layout evidence.
 */

export type OptionalLlmResult = {
  available: boolean;
  skipped_reason?: string;
  route?: string;
  caption?: string;
};

export async function maybeOptionalImageCaption(input: {
  path: string;
  mime: string;
  enabled: boolean;
}): Promise<OptionalLlmResult> {
  if (!input.enabled) {
    return { available: false, skipped_reason: 'include_optional_llm is false (default).' };
  }
  const url = process.env['IRIS_OPTIONAL_LLM_URL'];
  if (!url) {
    return {
      available: false,
      skipped_reason:
        'IRIS_OPTIONAL_LLM_URL is not set. Local OCR/layout remain the evidence authority.',
    };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        path: input.path,
        mime: input.mime,
        purpose: 'image_caption',
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return {
        available: false,
        skipped_reason: `optional LLM HTTP ${res.status}`,
        route: url,
      };
    }
    const body = (await res.json()) as { caption?: string };
    if (!body.caption || typeof body.caption !== 'string') {
      return {
        available: false,
        skipped_reason: 'optional LLM response missing caption string',
        route: url,
      };
    }
    return {
      available: true,
      route: `optional-llm:${url}`,
      caption: body.caption.slice(0, 4000),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'optional LLM failed';
    return { available: false, skipped_reason: message, route: url };
  }
}
