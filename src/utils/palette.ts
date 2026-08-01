/** Cheap local palette sample via optional sharp stats (not ML segmentation). */

export async function samplePalette(
  filePath: string,
): Promise<Array<{ hex: string; approx_share: number }> | undefined> {
  let sharp: any;
  try {
    const mod = await import('sharp');
    sharp = (mod as any).default ?? mod;
  } catch {
    return undefined;
  }

  try {
    const image = sharp(filePath, { failOn: 'none' }).resize(64, 64, { fit: 'inside' });
    const stats = await image.stats();
    const channels = stats.channels ?? [];
    // Prefer dominant if available; else approximate from channel means.
    if (stats.dominant) {
      const { r, g, b } = stats.dominant;
      const hex = `#${[r, g, b].map((n: number) => n.toString(16).padStart(2, '0')).join('')}`;
      return [{ hex, approx_share: 1 }];
    }
    if (channels.length >= 3) {
      const r = Math.round(channels[0].mean ?? 0);
      const g = Math.round(channels[1].mean ?? 0);
      const b = Math.round(channels[2].mean ?? 0);
      const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
      return [{ hex, approx_share: 1 }];
    }
    return undefined;
  } catch {
    return undefined;
  }
}
