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
  ocr_min_confidence: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe('Drop OCR words below this Tesseract confidence (0-100). Defaults to 0.'),
  include_ocr_words: z
    .boolean()
    .optional()
    .describe('When OCR is enabled, also return word-level bbox evidence. Defaults to false.'),
  region: boundingBoxSchema
    .optional()
    .describe('Optional pixel region to crop and attach as citeable evidence.'),
  include_region_image: z
    .boolean()
    .optional()
    .describe(
      'When region is set, include base64 PNG bytes of the cropped region. Defaults to false.'
    ),
  max_region_dimension: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum width or height when resizing the cropped region for evidence.'),
  include_layout: z
    .boolean()
    .optional()
    .describe(
      'When OCR lines exist, cluster them into reading-order text blocks (image architecture). Defaults to true when include_ocr is true.'
    ),
  include_agent_map: z
    .boolean()
    .optional()
    .describe(
      'Return a text-only agent_map so non-vision models can read image structure. Defaults to true.'
    ),
  include_palette: z
    .boolean()
    .optional()
    .describe('Sample an approximate local color palette via sharp (not ML). Defaults to false.'),
  include_optional_llm: z
    .boolean()
    .optional()
    .describe(
      'Optional local frontier caption via Ollama vision models or IRIS_OPTIONAL_LLM_URL. Off by default; never authority over OCR/layout evidence.'
    ),
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
      route: z.string().optional(),
      languages: z.array(z.string()).optional(),
      languages_warning: z.string().optional(),
      line_count: z.number().int().nonnegative().optional(),
      dropped_low_confidence: z.number().int().nonnegative().optional(),
      lines: z.array(ocrLineSchema),
      words: z
        .array(
          z.object({
            text: z.string(),
            bbox: boundingBoxSchema,
            confidence: z.number().min(0).max(100).optional(),
          })
        )
        .optional(),
      native_blocks: z
        .array(
          z.object({
            id: z.string(),
            kind: z.enum(['block', 'paragraph']),
            text: z.string(),
            bbox: boundingBoxSchema,
            confidence: z.number().optional(),
          })
        )
        .optional(),
    })
    .optional(),
  region_evidence: z
    .object({
      bbox: boundingBoxSchema,
      dimensions: imageDimensionsSchema,
      region_hash: z.string(),
      mime: z.string(),
      route: z.string(),
      resized: z.boolean().optional(),
      image_base64: z.string().optional(),
    })
    .optional(),
  layout: z
    .object({
      policy: z.string(),
      block_count: z.number().int().nonnegative(),
      blocks: z.array(
        z.object({
          id: z.string(),
          kind: z.literal('text_block'),
          text: z.string(),
          bbox: boundingBoxSchema,
          line_count: z.number().int().nonnegative(),
          reading_order: z.number().int().positive(),
        })
      ),
      full_text: z.string(),
      warnings: z.array(z.string()),
    })
    .optional(),
  agent_map: z
    .object({
      policy: z.string(),
      filename: z.string(),
      mime: z.string(),
      dimensions: imageDimensionsSchema,
      outline: z.string(),
      text_present: z.boolean(),
      block_count: z.number().int().nonnegative(),
      palette: z.array(z.object({ hex: z.string(), approx_share: z.number() })).optional(),
      optional_llm: z
        .object({
          available: z.boolean(),
          skipped_reason: z.string().optional(),
          route: z.string().optional(),
          caption: z.string().optional(),
          model: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  trust_warnings: z.array(z.string()),
});

export type ReadImageArgs = z.infer<typeof readImageArgsSchema>;
export type AgentMediaTwin = z.infer<typeof agentMediaTwinSchema>;
export type OcrLine = z.infer<typeof ocrLineSchema>;
export type BoundingBox = z.infer<typeof boundingBoxSchema>;
