import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BoundingBox } from '../schemas/readImage.js';
import { ErrorCode, ImageError } from '../utils/errors.js';

export type RustImageProbe = {
  format: string;
  mime: string;
  width: number;
  height: number;
  pixelCount: number;
  hasAlpha: boolean;
  colorType: string;
  sourceHash: string;
  fileSize: number;
  route: string;
};

export type RustRegionEvidence = {
  bbox: BoundingBox;
  width: number;
  height: number;
  pixelCount: number;
  regionHash: string;
  mime: string;
  route: string;
  resized: boolean;
  imageBase64?: string;
};

type RustProbeEnvelope =
  | { status: 'ok'; probe: RustImageProbe }
  | { status: 'error'; code: string; message: string };

type RustCropEnvelope =
  | { status: 'ok'; region_evidence: RustRegionEvidence }
  | { status: 'error'; code: string; message: string };

const here = path.dirname(fileURLToPath(import.meta.url));

export function resolveRustCliBinary(): string {
  const env = process.env['IMAGE_READER_CLI'];
  if (env && existsSync(env)) {
    return env;
  }

  const release = path.join(here, '../../target/release/image-reader-cli');
  if (existsSync(release)) {
    return release;
  }

  const debug = path.join(here, '../../target/debug/image-reader-cli');
  if (existsSync(debug)) {
    return debug;
  }

  return 'image-reader-cli';
}

export function isRustCliAvailable(): boolean {
  return resolveRustCliBinary() !== 'image-reader-cli';
}

export function shouldUseRustDecodeEngine(): boolean {
  if (process.env['IMAGE_READER_USE_RUST_DECODE'] === '0') {
    return false;
  }
  if (process.env['IMAGE_READER_USE_RUST_DECODE'] === '1') {
    return true;
  }
  return isRustCliAvailable();
}

const invokeRustCli = (tool: string, input: Record<string, unknown>): unknown => {
  const binary = resolveRustCliBinary();
  const payload = JSON.stringify({ tool, input });

  const result = spawnSync(binary, [], {
    input: payload,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.error) {
    throw new ImageError(
      ErrorCode.InvalidRequest,
      `Failed to launch image decode engine: ${result.error.message}`
    );
  }

  if (result.status !== 0) {
    throw new ImageError(
      ErrorCode.InvalidRequest,
      result.stderr || `Image decode engine exited with status ${result.status}`
    );
  }

  return JSON.parse(result.stdout) as unknown;
};

const mapErrorCode = (code: string): ErrorCode =>
  code === 'INVALID_PARAMS' ? ErrorCode.InvalidParams : ErrorCode.InvalidRequest;

export function probeImageViaRustEngine(filePath: string, maxFileBytes: number): RustImageProbe {
  const envelope = invokeRustCli('image_probe', {
    path: filePath,
    max_file_bytes: maxFileBytes,
  }) as RustProbeEnvelope;

  if (envelope.status !== 'ok') {
    throw new ImageError(mapErrorCode(envelope.code), envelope.message);
  }

  return envelope.probe;
}

export function cropRegionViaRustEngine(input: {
  filePath: string;
  maxFileBytes: number;
  maxPixels: number;
  region: BoundingBox;
  maxRegionDimension?: number | undefined;
  includeRegionImage?: boolean | undefined;
}): RustRegionEvidence {
  const envelope = invokeRustCli('crop_region', {
    path: input.filePath,
    max_file_bytes: input.maxFileBytes,
    max_pixels: input.maxPixels,
    region: input.region,
    ...(input.maxRegionDimension !== undefined
      ? { max_region_dimension: input.maxRegionDimension }
      : {}),
    ...(input.includeRegionImage !== undefined
      ? { include_region_image: input.includeRegionImage }
      : {}),
  }) as RustCropEnvelope;

  if (envelope.status !== 'ok') {
    throw new ImageError(mapErrorCode(envelope.code), envelope.message);
  }

  return envelope.region_evidence;
}
