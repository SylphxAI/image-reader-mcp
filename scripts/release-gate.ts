import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runDoctor } from '../src/doctor.js';
import { cropRegionViaRustEngine } from '../src/engine/rust-decode.js';
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
    'rust:crop_region_core',
    fileExists('crates/image-reader-core/src/lib.rs') &&
      readFileSync(path.join(repoRoot, 'crates/image-reader-core/src/lib.rs'), 'utf8').includes(
        'pub fn crop_region'
      ),
    'Rust image-reader-core exposes crop_region for region evidence',
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

  const sampleFixture = path.join(repoRoot, 'test/fixtures/sample.png');
  if (existsSync(sampleFixture)) {
    try {
      const evidence = cropRegionViaRustEngine({
        filePath: sampleFixture,
        maxFileBytes: IMAGE_SAFETY_LIMITS.maxFileBytes,
        maxPixels: IMAGE_SAFETY_LIMITS.maxPixels,
        region: { x: 2, y: 1, width: 8, height: 4 },
      });
      addCheck(
        checks,
        'boundary:crop_region',
        evidence.route === 'rust-crop' && evidence.regionHash.length > 0,
        'crop_region returns citeable region evidence from the Rust CLI',
        {
          route: evidence.route,
          width: evidence.width,
          height: evidence.height,
        }
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      addCheck(
        checks,
        'boundary:crop_region',
        false,
        `crop_region boundary check failed: ${message}`
      );
    }
  } else {
    addCheck(
      checks,
      'boundary:crop_region',
      false,
      'sample.png fixture is missing for crop_region boundary checks'
    );
  }

  const binWrapper = readFileSync(path.join(repoRoot, 'bin/image-reader-mcp'), 'utf8');
  addCheck(
    checks,
    'mcp:rust_adapter_default',
    binWrapper.includes('image-reader-mcp-server') &&
      binWrapper.includes('resolve_rust_bin') &&
      binWrapper.includes('use_ts_transport'),
    'Default npm bin launches the Rust rmcp MCP server; TypeScript adapter is opt-in only'
  );

  const httpTransportSource = readFileSync(
    path.join(repoRoot, 'crates/image-reader-mcp-server/src/http_transport.rs'),
    'utf8'
  );
  addCheck(
    checks,
    'mcp:rust_web_http_transport',
    httpTransportSource.includes('StreamableHttpService') &&
      httpTransportSource.includes('/mcp/health') &&
      binWrapper.includes('resolve_transport') &&
      binWrapper.includes('MCP_TRANSPORT=http'),
    'Rust rmcp streamable HTTP Web MCP transport is wired; npm bin routes MCP_TRANSPORT=http to Rust'
  );

  const matrixProbe = spawnSync('bun', ['test', 'test/shippedPath.matrix.test.ts'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      IMAGE_READER_ALLOW_LEGACY_ENGINE: '',
    },
    timeout: 300_000,
  });
  addCheck(
    checks,
    'boundary:rust_cli_engine',
    fileExists('crates/image-reader-mcp-server/src/tool_routes.rs') && matrixProbe.status === 0,
    'Shipped-path matrix test proves primary tools route through Rust core without legacy runtime',
    matrixProbe.status === 0
      ? { exitCode: 0 }
      : {
          exitCode: matrixProbe.status,
          stderr: matrixProbe.stderr?.slice(-2000),
          stdout: matrixProbe.stdout?.slice(-2000),
        }
  );

  try {
    execSync('cargo build --release -p image-reader-mcp-server', {
      cwd: repoRoot,
      stdio: 'pipe',
      timeout: 300_000,
    });
    addCheck(
      checks,
      'rust:mcp_server_crate',
      fileExists('target/release/image-reader-mcp-server'),
      'image-reader-mcp-server rmcp crate builds for release'
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    addCheck(checks, 'rust:mcp_server_crate', false, `image-reader-mcp-server build failed: ${message}`);
  }

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

  addCheck(
    checks,
    'contract:reader_evidence_dep',
    typeof pkg.dependencies?.['@sylphx/reader-evidence'] === 'string' &&
      (fileExists('node_modules/@sylphx/reader-evidence/src/envelope.ts') ||
        fileExists('node_modules/@sylphx/reader-evidence/src/index.ts')),
    'image-reader depends on @sylphx/reader-evidence shared schema package',
    { dependency: pkg.dependencies?.['@sylphx/reader-evidence'] }
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