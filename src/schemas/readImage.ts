import { z } from 'zod';

export const boundingBoxSchema = z.object({
  x: z.number().describe('Left edge in pixels.'),
  y: z.number().describe('Top edge in pixels.'),
  width: z.number().describe('Width in pixels.'),
  height: z.number().describe('Height in pixels.'),
});

export const ocrLineSchema = z.object({
  text: z.string(),
  bbox: boundingBoxSchema,
  confidence: z.number().min(0).max(100).optional(),
});

export const imageDimensionsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const readImageArgsSchema = z.object({
  path: z.string().min(1).describe('Path to the local image file (absolute or relative to cwd).'),
  include_metadata: z
    .boolean()
    .optional()
    .describe('Include EXIF, XMP, and IPTC metadata when present. Defaults to true.'),
  include_ocr: z
    .boolean()
    .optional()
    .describe(
      'Attempt OCR via the local Tesseract adapter when installed. Defaults to false; gracefully skips when unavailable.'
    ),
  ocr_languages: z
    .array(z.string().min(1))
    .optional()
    .describe('OCR language codes for Tesseract (e.g. ["eng"]). Defaults to ["eng"].'),
});

export const agentMediaTwinSchema = z.object({
  filename: z.string(),
  mime: z.string(),
  dimensions: imageDimensionsSchema,
  orientation: z.number().int().optional(),
  color_space: z.string().optional(),
  has_alpha: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  ocr: z
    .object({
      available: z.boolean(),
      skipped_reason: z.string().optional(),
      lines: z.array(ocrLineSchema),
    })
    .optional(),
  trust_warnings: z.array(z.string()),
});

export type ReadImageArgs = z.infer<typeof readImageArgsSchema>;
export type AgentMediaTwin = z.infer<typeof agentMediaTwinSchema>;
export type OcrLine = z.infer<typeof ocrLineSchema>;
export type BoundingBox = z.infer<typeof boundingBoxSchema>;
