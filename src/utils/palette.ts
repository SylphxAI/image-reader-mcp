/** Cheap local palette sample via optional sharp stats (not ML segmentation). */

type SharpLike = (
  input: string,
  opts?: { failOn?: string }
) => {
  resize: (
    w: number,
    h: number,
    opts: { fit: string }
  ) => {
    stats: () => Promise<{
      dominant?: { r: number; g: number; b: number };
      channels?: Array<{ mean?: number }>;
    }>;
  };
};

export async function samplePalette(
  filePath: string
): Promise<Array<{ hex: string; approx_share: number }> | undefined> {
  let sharp: SharpLike;
  try {
    const mod = await import('sharp');
    const candidate = (mod as { default?: SharpLike }).default ?? (mod as unknown as SharpLike);
    sharp = candidate;
  } catch {
    return undefined;
  }

  try {
    const image = sharp(filePath, { failOn: 'none' }).resize(64, 64, { fit: 'inside' });
    const stats = await image.stats();
    const channels = stats.channels ?? [];
    if (stats.dominant) {
      const { r, g, b } = stats.dominant;
      const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
      return [{ hex, approx_share: 1 }];
    }
    if (channels.length >= 3) {
      const r = Math.round(channels[0]?.mean ?? 0);
      const g = Math.round(channels[1]?.mean ?? 0);
      const b = Math.round(channels[2]?.mean ?? 0);
      const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
      return [{ hex, approx_share: 1 }];
    }
    return undefined;
  } catch {
    return undefined;
  }
}
