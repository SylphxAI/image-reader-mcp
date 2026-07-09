import fs, { stat } from 'node:fs/promises';
import path from 'node:path';
import exifr from 'exifr';
import sharp from 'sharp';
import {
  probeImageViaRustEngine,
  shouldUseRustDecodeEngine,
} from '../engine/rust-decode.js';
import { text, tool, toolError } from '../mcp.js';
import { type AgentMediaTwin, readImageArgsSchema } from '../schemas/readImage.js';
import { ErrorCode, ImageError } from '../utils/errors.js';
import { collectTrustWarnings, redactGpsFields } from '../utils/metadata.js';
import { runTesseractOcr } from '../utils/ocr.js';
import { resolvePath } from '../utils/pathUtils.js';
import { IMAGE_SAFETY_LIMITS, validateImageSafety } from '../utils/safety.js';

const mimeFromFormat = (format: string | undefined): string => {
  switch (format) {
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'tiff':
      return 'image/tiff';
    case 'avif':
      return 'image/avif';
    case 'heif':
      return 'image/heif';
    default:
      return format ? `image/${format}` : 'application/octet-stream';
  }
};

const readMetadata = async (
  filePath: string,
  includeMetadata: boolean
): Promise<{ metadata?: Record<string, unknown>; trustWarnings: string[] }> => {
  if (!includeMetadata) {
    return { trustWarnings: [] };
  }

  try {
    const parsed = await exifr.parse(filePath, {
      tiff: true,
      xmp: true,
      iptc: true,
      icc: false,
      jfif: false,
      ihdr: false,
      mergeOutput: true,
    });

    if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) {
      return {
        trustWarnings: ['No EXIF, XMP, or IPTC metadata was found in this image.'],
      };
    }

    const rawMetadata = parsed as Record<string, unknown>;
    const { metadata, hadGps } = redactGpsFields(rawMetadata);
    const trustWarnings = collectTrustWarnings(rawMetadata, hadGps);
    return { metadata, trustWarnings };
  } catch {
    return {
      trustWarnings: ['Metadata extraction failed or metadata is not present in this image.'],
    };
  }
};

export const readImage = tool()
  .description(
    'Evidence-first image reader. Returns an Agent Media Twin with filename, mime, dimensions, metadata, optional OCR lines with bounding boxes, and trust warnings. No generative LLM is used.'
  )
  .input(readImageArgsSchema)
  .handler(async ({ input }) => {
    let resolvedPath: string;

    try {
      resolvedPath = resolvePath(input.path);
    } catch (error: unknown) {
      if (error instanceof ImageError) {
        return toolError(error.message);
      }
      throw error;
    }

    try {
      await fs.access(resolvedPath);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'File not found.';
      return toolError(`Unable to read image at '${input.path}': ${message}`);
    }

    try {
      const fileStat = await stat(resolvedPath);
      validateImageSafety({ fileSizeBytes: fileStat.size });

      const includeMetadata = input.include_metadata ?? true;
      const includeOcr = input.include_ocr ?? false;
      const ocrLanguages = input.ocr_languages ?? ['eng'];
      const useRustDecode = shouldUseRustDecodeEngine();

      let twin: AgentMediaTwin;

      if (useRustDecode) {
        const probe = probeImageViaRustEngine(resolvedPath, IMAGE_SAFETY_LIMITS.maxFileBytes);
        validateImageSafety({
          fileSizeBytes: probe.fileSize,
          width: probe.width,
          height: probe.height,
        });

        const { metadata: extractedMetadata, trustWarnings } = await readMetadata(
          resolvedPath,
          includeMetadata
        );

        twin = {
          filename: path.basename(resolvedPath),
          mime: probe.mime,
          dimensions: {
            width: probe.width,
            height: probe.height,
          },
          has_alpha: probe.hasAlpha,
          color_space: probe.colorType,
          trust_warnings: [
            `Decode route: ${probe.route} (source hash ${probe.sourceHash.slice(0, 12)}…).`,
            ...trustWarnings,
          ],
        };

        if (extractedMetadata !== undefined) {
          twin.metadata = extractedMetadata;
        }
      } else {
        const image = sharp(resolvedPath, { failOn: 'none' });
        const metadata = await image.metadata();
        validateImageSafety({
          fileSizeBytes: fileStat.size,
          width: metadata.width,
          height: metadata.height,
        });

        const { metadata: extractedMetadata, trustWarnings } = await readMetadata(
          resolvedPath,
          includeMetadata
        );

        twin = {
          filename: path.basename(resolvedPath),
          mime: mimeFromFormat(metadata.format),
          dimensions: {
            width: metadata.width ?? 0,
            height: metadata.height ?? 0,
          },
          trust_warnings: [...trustWarnings],
        };

        if (metadata.orientation !== undefined) {
          twin.orientation = metadata.orientation;
        }
        if (metadata.space !== undefined) {
          twin.color_space = metadata.space;
        }
        if (metadata.hasAlpha !== undefined) {
          twin.has_alpha = metadata.hasAlpha;
        }

        if (extractedMetadata !== undefined) {
          twin.metadata = extractedMetadata;
        }
      }
      if (twin.dimensions.width <= 0 || twin.dimensions.height <= 0) {
        throw new ImageError(
          ErrorCode.InvalidRequest,
          `Unable to determine image dimensions for '${input.path}'.`
        );
      }

      if (includeOcr) {
        const ocr = runTesseractOcr(resolvedPath, ocrLanguages);
        twin.ocr = {
          available: ocr.available,
          lines: ocr.lines,
          ...(ocr.skipped_reason !== undefined ? { skipped_reason: ocr.skipped_reason } : {}),
        };
      }

      return text(JSON.stringify(twin, null, 2));
    } catch (error: unknown) {
      if (error instanceof ImageError) {
        return toolError(error.message);
      }

      const message = error instanceof Error ? error.message : 'Unknown image read failure.';
      return toolError(`Failed to read image '${input.path}': ${message}`);
    }
  });
