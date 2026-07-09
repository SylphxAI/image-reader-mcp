import { ErrorCode, ImageError } from './errors.js';

export const IMAGE_SAFETY_LIMITS = {
  maxFileBytes: 32 * 1024 * 1024,
  maxPixels: 64 * 1024 * 1024,
} as const;

export function validateImageSafety(input: {
  fileSizeBytes: number;
  width?: number | undefined;
  height?: number | undefined;
}): void {
  if (input.fileSizeBytes > IMAGE_SAFETY_LIMITS.maxFileBytes) {
    throw new ImageError(
      ErrorCode.InvalidRequest,
      `Image exceeds the ${IMAGE_SAFETY_LIMITS.maxFileBytes} byte safety limit.`
    );
  }

  if (input.width !== undefined && input.height !== undefined) {
    const pixels = input.width * input.height;
    if (pixels > IMAGE_SAFETY_LIMITS.maxPixels) {
      throw new ImageError(
        ErrorCode.InvalidRequest,
        `Image exceeds the ${IMAGE_SAFETY_LIMITS.maxPixels} pixel safety budget (${input.width}x${input.height}).`
      );
    }
  }
}
