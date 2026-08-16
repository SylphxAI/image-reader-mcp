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

interface PackageManifest {
  version: string;
  bin?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  exports?: Record<string, unknown>;
}

interface ServerManifest {
  title?: string;
  version?: string;
  packages?: Array<{ version?: string }>;
}

type DoctorCheckSummary = {
  id: string;
  status: 'ok' | 'warn' | 'fail';
};

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

export function serverManifestMatchesPackage(
  packageVersion: string,
  serverJson: ServerManifest | null
): boolean {
  return (
    serverJson?.version === packageVersion &&
    serverJson.packages?.[0]?.version === packageVersion
  );
}

export function hasUsableDecodePath(checks: readonly DoctorCheckSummary[]): boolean {
  const sharp = checks.find((check) => check.id === 'sharp');
  const rust = checks.find((check) => check.id === 'rust_decode_cli');

  return sharp?.status === 'ok' || (sharp?.status === 'warn' && rust?.status === 'ok');
}

export async function buildReleaseGateReport(artifactDir: string): Promise<ReleaseGateReport> {
  const checks: GateCheck[] = [];
  const pkg = readJson('package.json') as PackageManifest;

  addCheck(
    checks,
    'package:read_image_bin',
    typeof pkg.bin?.iris === 'string' && !pkg.bin?.['image-reader-mcp'],
    'package.json exposes brand-only iris bin (no transitional image-reader-mcp bin)',
    { bin: pkg.bin }
  );

  addCheck(
    checks,
    'package:iris_brand_bin',
    typeof pkg.bin?.iris === 'string',
    'package.json exposes brand bin iris',
    { bin: pkg.bin?.iris }
  );

  addCheck(
    checks,
    'package:sdk_export',
    Boolean(pkg.exports && pkg.exports['./sdk']),
    'package.json exports SDK surface (./sdk or ./iris)',
    { exports: pkg.exports }
  );

  const serverJson = fileExists('server.json') ? (readJson('server.json') as ServerManifest) : null;
  addCheck(
    checks,
    'marketplace:server_json_title_iris',
    serverJson?.title === 'Iris',
    'server.json marketplace title is Iris',
    { title: serverJson?.title }
  );

  addCheck(
    checks,
    'marketplace:server_json_version',
    serverManifestMatchesPackage(pkg.version, serverJson),
    'server.json and its npm package version match package.json',
    {
      packageVersion: pkg.version,
      serverVersion: serverJson?.version,
      marketplacePackageVersion: serverJson?.packages?.[0]?.version,
    }
  );

  addCheck(
    checks,
    'sdk:iris_source',
    fileExists('src/sdk.ts'),
    'Iris SDK source is present at src/sdk.ts'
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
  const sharpCheck = doctor.checks.find((check) => check.id === 'sharp');
  const rustDecodeCheck = doctor.checks.find((check) => check.id === 'rust_decode_cli');
  addCheck(
    checks,
    'doctor:sharp',
    hasUsableDecodePath(doctor.checks),
    'doctor reports sharp or Rust decode pipeline is available',
    {
      doctorStatus: doctor.status,
      sharpStatus: sharpCheck?.status,
      rustDecodeStatus: rustDecodeCheck?.status,
    }
  );

  addCheck(
    checks,
    'doctor:safety_limits',
    doctor.checks.find((check) => check.id === 'safety_limits')?.status === 'ok',
    'doctor reports safety limits are configured'
  );

  addCheck(
    checks,
    'contract:product_local_evidence',
    !pkg.dependencies?.['@sylphx/reader-evidence'] &&
      !pkg.devDependencies?.['@sylphx/reader-evidence'] &&
      fileExists('docs/PRODUCT_INDEPENDENCE.md'),
    'product owns evidence locally; no archived @sylphx/reader-evidence dependency',
    { independenceDoc: 'docs/PRODUCT_INDEPENDENCE.md' }
  );

  addCheck(
    checks,
    'surface:agent_skill',
    fileExists('skills/iris/SKILL.md'),
    'Agent skill surface is present at skills/iris/SKILL.md'
  );

  addCheck(
    checks,
    'surface:public_proof_script',
    fileExists('scripts/public-proof.ts'),
    'Public proof script is present'
  );

  addCheck(
    checks,
    'docs:brand_publish',
    fileExists('docs/BRAND_PUBLISH.md'),
    'Brand publish readiness doc is present'
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
