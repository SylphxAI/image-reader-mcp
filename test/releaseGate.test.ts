import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import {
  buildReleaseGateReport,
  hasUsableDecodePath,
  nativeOptionalDependenciesMatchPackage,
  serverManifestMatchesPackage,
} from '../scripts/release-gate.js';

describe('image reader release gate', () => {
  it('passes Phase 0 contract checks', async () => {
    const report = await buildReleaseGateReport(
      path.join(import.meta.dirname, '..', 'benchmark-artifacts')
    );

    expect(report.profile).toBe('image_reader_release_gate');
    expect(report.status).toBe('passed');
    expect(report.summary.failed).toBe(0);
    expect(report.checks.some((check) => check.id === 'safety:byte_limit')).toBe(true);
    expect(report.checks.some((check) => check.id === 'examples:metadata_request')).toBe(true);
    expect(report.checks.some((check) => check.id === 'contract:product_local_evidence')).toBe(
      true
    );
  }, 300_000);

  it('accepts the Rust decode path when optional sharp is absent', () => {
    expect(
      hasUsableDecodePath([
        { id: 'sharp', status: 'warn' },
        { id: 'rust_decode_cli', status: 'ok' },
      ])
    ).toBe(true);
    expect(
      hasUsableDecodePath([
        { id: 'sharp', status: 'warn' },
        { id: 'rust_decode_cli', status: 'warn' },
      ])
    ).toBe(false);
  });

  it('requires package and marketplace versions to stay aligned', async () => {
    const report = await buildReleaseGateReport(
      path.join(import.meta.dirname, '..', 'benchmark-artifacts')
    );
    const check = report.checks.find((entry) => entry.id === 'marketplace:server_json_version');

    expect(check?.status).toBe('passed');
    expect(serverManifestMatchesPackage('0.2.1', { version: '0.2.0' })).toBe(false);
    expect(
      serverManifestMatchesPackage('0.2.1', {
        version: '0.2.1',
        packages: [{ version: '0.2.0' }],
      })
    ).toBe(false);
    expect(
      nativeOptionalDependenciesMatchPackage('0.2.1', {
        version: '0.2.1',
        optionalDependencies: {
          '@sylphx/iris-darwin-arm64': '0.2.1',
          '@sylphx/iris-darwin-x64': '0.2.1',
          '@sylphx/iris-linux-x64-gnu': '0.2.1',
          '@sylphx/iris-linux-arm64-gnu': '0.2.1',
        },
      })
    ).toBe(true);
    expect(
      nativeOptionalDependenciesMatchPackage('0.2.1', {
        version: '0.2.1',
        optionalDependencies: {
          '@sylphx/iris-darwin-arm64': '0.2.0',
          '@sylphx/iris-darwin-x64': '0.2.1',
          '@sylphx/iris-linux-x64-gnu': '0.2.1',
          '@sylphx/iris-linux-arm64-gnu': '0.2.1',
        },
      })
    ).toBe(false);
  }, 300_000);
});
