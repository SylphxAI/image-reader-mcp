import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

type RustProbeEnvelope =
  | { status: 'ok'; probe: RustImageProbe }
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

export function shouldUseRustDecodeEngine(): boolean {
  return process.env['IMAGE_READER_USE_RUST_DECODE'] === '1';
}

export function probeImageViaRustEngine(
  filePath: string,
  maxFileBytes: number
): RustImageProbe {
  const binary = resolveRustCliBinary();
  const payload = JSON.stringify({
    tool: 'image_probe',
    input: {
      path: filePath,
      max_file_bytes: maxFileBytes,
    },
  });

  const result = spawnSync(binary, [], {
    input: payload,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
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

  const envelope = JSON.parse(result.stdout) as RustProbeEnvelope;
  if (envelope.status !== 'ok') {
    const code =
      envelope.code === 'INVALID_PARAMS' ? ErrorCode.InvalidParams : ErrorCode.InvalidRequest;
    throw new ImageError(code, envelope.message);
  }

  return envelope.probe;
}