import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { buildReleaseGateReport, serverManifestMatchesPackage } from '../scripts/release-gate.js';

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
  }, 300_000);
});
