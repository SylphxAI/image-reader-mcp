import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { buildReleaseGateReport } from '../scripts/release-gate.js';

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
    expect(report.checks.some((check) => check.id === 'mcp:rust_adapter_default')).toBe(true);
    expect(report.checks.some((check) => check.id === 'mcp:ts_adapter_deleted')).toBe(true);
    expect(report.checks.find((check) => check.id === 'mcp:rust_adapter_default')?.status).toBe(
      'passed'
    );
    expect(report.checks.find((check) => check.id === 'mcp:ts_adapter_deleted')?.status).toBe(
      'passed'
    );
  }, 300_000);
});
