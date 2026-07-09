import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runDoctor } from '../src/doctor.js';
import { IMAGE_SAFETY_LIMITS } from '../src/utils/safety.js';

const ARTIFACT_DIR_ENV = 'MCP_IMAGE_BENCHMARK_OUTPUT_DIR';
const DEFAULT_ARTIFACT_DIR = 'benchmark-artifacts';
const ARTIFACT_FILE = 'image_reader_release_gate.json';

type GateStatus = 'passed' | 'failed';

interface GateCheck {
  id: string;
  status: GateStatus;
  message: string;
  evidence?: Record<string, unknown>;
}

interface ReleaseGateReport {
  profile: 'image_reader_release_gate';
  generated_at: string;
  artifact_dir: string;
  status: GateStatus;
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  checks: GateCheck[];
}

const repoRoot = path.resolve(import.meta.dirname, '..');

const addCheck = (
  checks: GateCheck[],
  id: string,
  passed: boolean,
  message: string,
  evidence?: Record<string, unknown>
): void => {
  checks.push({
    id,
    status: passed ? 'passed' : 'failed',
    message,
    ...(evidence ? { evidence } : {}),
  });
};

const fileExists = (relativePath: string): boolean =>
  existsSync(path.join(repoRoot, relativePath));

const readJson = (relativePath: string): unknown =>
  JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8'));

export async function buildReleaseGateReport(artifactDir: string): Promise<ReleaseGateReport> {
  const checks: GateCheck[] = [];
  const pkg = readJson('package.json') as { version: string; bin?: Record<string, string> };

  addCheck(
    checks,
    'package:read_image_bin',
    typeof pkg.bin?.['image-reader-mcp'] === 'string',
    'package.json exposes the image-reader-mcp bin entry',
    { bin: pkg.bin?.['image-reader-mcp'] }
  );

  addCheck(
    checks,
    'safety:byte_limit',
    IMAGE_SAFETY_LIMITS.maxFileBytes === 32 * 1024 * 1024,
    '32 MiB file byte safety limit is configured',
    { maxFileBytes: IMAGE_SAFETY_LIMITS.maxFileBytes }
  );

  addCheck(
    checks,
    'rust:decode_core',
    fileExists('crates/image-reader-core/src/lib.rs'),
    'Rust image-reader-core decode engine is present',
  );

  addCheck(
    checks,
    'safety:pixel_limit',
    IMAGE_SAFETY_LIMITS.maxPixels === 64 * 1024 * 1024,
    '64 megapixel safety budget is configured',
    { maxPixels: IMAGE_SAFETY_LIMITS.maxPixels }
  );

  addCheck(
    checks,
    'fixtures:sample_png',
    fileExists('test/fixtures/sample.png') || fileExists('test/fixtures/.gitkeep'),
    'Checked-in image fixture scaffold exists for deterministic handler tests'
  );

  addCheck(
    checks,
    'examples:metadata_request',
    fileExists('examples/metadata-only-request.json'),
    'examples/metadata-only-request.json documents a metadata-only read_image call'
  );

  addCheck(
    checks,
    'examples:ocr_request',
    fileExists('examples/ocr-request.json'),
    'examples/ocr-request.json documents an OCR-enabled read_image call'
  );

  addCheck(
    checks,
    'examples:response_shape',
    fileExists('examples/sample-agent-media-twin.json'),
    'examples/sample-agent-media-twin.json documents the Agent Media Twin response shape'
  );

  const doctor = await runDoctor(pkg.version);
  addCheck(
    checks,
    'doctor:sharp',
    doctor.checks.find((check) => check.id === 'sharp')?.status === 'ok',
    'doctor reports sharp decode pipeline is available',
    { doctorStatus: doctor.status }
  );

  addCheck(
    checks,
    'doctor:safety_limits',
    doctor.checks.find((check) => check.id === 'safety_limits')?.status === 'ok',
    'doctor reports safety limits are configured'
  );

  const passed = checks.filter((check) => check.status === 'passed').length;
  const failed = checks.length - passed;

  return {
    profile: 'image_reader_release_gate',
    generated_at: new Date().toISOString(),
    artifact_dir: artifactDir,
    status: failed === 0 ? 'passed' : 'failed',
    summary: {
      total: checks.length,
      passed,
      failed,
    },
    checks,
  };
}

async function main(): Promise<void> {
  const artifactDir = path.resolve(
    process.env[ARTIFACT_DIR_ENV] ?? path.join(repoRoot, DEFAULT_ARTIFACT_DIR)
  );

  const report = await buildReleaseGateReport(artifactDir);
  mkdirSync(artifactDir, { recursive: true });
  const outputPath = path.join(artifactDir, ARTIFACT_FILE);

  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.error(`Image reader release gate report written to ${outputPath}`);

  if (report.status !== 'passed') {
    for (const check of report.checks.filter((entry) => entry.status === 'failed')) {
      console.error(`[FAILED] ${check.id}: ${check.message}`);
    }
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}