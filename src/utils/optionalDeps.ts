/** Optional heavy deps — never required for Rust-first MCP zero-config path. */

export async function loadSharp(): Promise<typeof import('sharp')> {
  try {
    return (await import('sharp')).default as unknown as typeof import('sharp');
  } catch {
    throw new Error(
      'Optional dependency `sharp` is not installed. Use the Rust decode engine (default when native CLI is present), or `npm i sharp` for the TS fallback path.',
    );
  }
}

export async function loadExifr(): Promise<typeof import('exifr')> {
  try {
    return (await import('exifr')).default as unknown as typeof import('exifr');
  } catch {
    throw new Error(
      'Optional dependency `exifr` is not installed. Metadata extraction is unavailable until you `npm i exifr` (geometry/OCR still work).',
    );
  }
}

export async function tryLoadSharp(): Promise<typeof import('sharp') | null> {
  try {
    return await loadSharp();
  } catch {
    return null;
  }
}
