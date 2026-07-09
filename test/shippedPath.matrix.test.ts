import { beforeAll, describe, expect, it } from 'bun:test';
import { execSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const rustCliBin = path.join(repoRoot, 'target/release/image-reader-cli');
const samplePng = path.join(repoRoot, 'test/fixtures/sample.png');

type CliEnvelope = {
  status?: string;
  code?: string;
  message?: string;
  engine?: string;
  route?: string;
  probe?: { route?: string; mime?: string };
  region_evidence?: { route?: string; regionHash?: string };
  twin?: { mime?: string; trust_warnings?: string[]; region_evidence?: { route?: string } };
  envelope?: {
    subject?: string;
    delegation?: { delegated_tool?: string; reader_package?: string };
    result?: { mime?: string };
  };
};

const invokeCli = (tool: string, input: Record<string, unknown>, env: NodeJS.ProcessEnv) => {
  const probe = spawnSync(rustCliBin, [], {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
    input: JSON.stringify({ tool, input }),
    timeout: 30_000,
  });
  expect(probe.status).toBe(0);
  return JSON.parse(probe.stdout) as CliEnvelope;
};

describe('shipped path matrix (Rust core, no legacy flags)', () => {
  let fakeNodeEnv: NodeJS.ProcessEnv;
  let nodeInvokeLog: string;

  beforeAll(() => {
    execSync('bun run build:rust', { cwd: repoRoot, stdio: 'pipe', timeout: 300_000 });

    const probeDir = mkdtempSync(path.join(os.tmpdir(), 'image-reader-matrix-probe-'));
    nodeInvokeLog = path.join(probeDir, 'node-invoke.log');
    const fakeNode = path.join(probeDir, 'node');
    writeFileSync(
      fakeNode,
      `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >> "${nodeInvokeLog}"\nexit 99\n`
    );
    chmodSync(fakeNode, 0o755);

    fakeNodeEnv = {
      ...process.env,
      IMAGE_READER_NODE: fakeNode,
      IMAGE_READER_ALLOW_LEGACY_ENGINE: '',
      IMAGE_READER_MCP_TRANSPORT: '',
    };
  }, 300_000);

  it('image_probe routes through image-reader-core without legacy runtime', () => {
    const envelope = invokeCli('image_probe', { path: samplePng }, fakeNodeEnv);
    expect(envelope.status).toBe('ok');
    expect(envelope.engine).toBe('image-reader-core');
    expect(envelope.probe?.route).toBe('rust-probe');
    expect(existsSync(nodeInvokeLog)).toBe(false);
  });

  it('crop_region routes through image-reader-core without legacy runtime', () => {
    const envelope = invokeCli(
      'crop_region',
      {
        path: samplePng,
        region: { x: 2, y: 1, width: 8, height: 4 },
      },
      fakeNodeEnv
    );
    expect(envelope.status).toBe('ok');
    expect(envelope.engine).toBe('image-reader-core');
    expect(envelope.region_evidence?.route).toBe('rust-crop');
    expect(envelope.region_evidence?.regionHash?.length).toBeGreaterThan(0);
    expect(existsSync(nodeInvokeLog)).toBe(false);
  });

  it('read_image returns rust-read-image-v1 without legacy runtime', () => {
    const envelope = invokeCli(
      'read_image',
      { path: samplePng, include_metadata: false },
      fakeNodeEnv
    );
    expect(envelope.status).toBe('ok');
    expect(envelope.route).toBe('rust-read-image-v1');
    expect(envelope.twin?.mime).toBe('image/png');
    expect(envelope.envelope?.delegation?.delegated_tool).toBe('read_image');
    expect(envelope.envelope?.delegation?.reader_package).toBe('@sylphx/image-reader-mcp');
    expect(envelope.twin?.trust_warnings?.some((warning) => warning.includes('rust-probe'))).toBe(
      true
    );
    expect(existsSync(nodeInvokeLog)).toBe(false);
  });

  it('read_image attaches region evidence on the default Rust route', () => {
    const envelope = invokeCli(
      'read_image',
      {
        path: samplePng,
        include_metadata: false,
        region: { x: 4, y: 2, width: 10, height: 6 },
      },
      fakeNodeEnv
    );
    expect(envelope.status).toBe('ok');
    expect(envelope.twin?.region_evidence?.route).toBe('rust-crop');
    expect(existsSync(nodeInvokeLog)).toBe(false);
  });

  it('default bin resolves staged rmcp server', () => {
    const bin = path.join(repoRoot, 'bin/image-reader-mcp');
    expect(existsSync(bin)).toBe(true);
    const staged = path.join(repoRoot, 'bin/native/image-reader-mcp-server');
    expect(existsSync(staged)).toBe(true);
  });
});
