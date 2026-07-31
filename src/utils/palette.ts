import sharp from 'sharp';

/** Cheap local palette sample via sharp stats (not ML segmentation). */
export async function samplePalette(
  filePath: string,
  maxColors = 5
): Promise<Array<{ hex: string; approx_share: number }>> {
  const image = sharp(filePath, { failOn: 'none' }).resize(64, 64, { fit: 'inside' });
  const stats = await image.stats();
  const dominant = stats.dominant;
  if (!dominant) return [];

  const hex = (r: number, g: number, b: number) =>
    `#${[r, g, b]
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')}`;

  const colors: Array<{ hex: string; approx_share: number }> = [
    { hex: hex(dominant.r, dominant.g, dominant.b), approx_share: 0.55 },
  ];

  // Channel means as a second honest swatch (not true multi-color clustering).
  const ch = stats.channels;
  if (ch && ch.length >= 3) {
    colors.push({
      hex: hex(ch[0]?.mean ?? dominant.r, ch[1]?.mean ?? dominant.g, ch[2]?.mean ?? dominant.b),
      approx_share: 0.45,
    });
  }

  return colors.slice(0, maxColors);
}
