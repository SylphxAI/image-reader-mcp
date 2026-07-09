import { describe, expect, it } from 'bun:test';
import { runDoctor } from '../src/doctor.js';

describe('image reader doctor', () => {
  it('returns structured install diagnostics', async () => {
    const report = await runDoctor('0.1.0');

    expect(report.profile).toBe('image_reader_doctor');
    expect(['ready', 'degraded', 'unavailable']).toContain(report.status);
    expect(report.checks.some((check) => check.id === 'sharp')).toBe(true);
    expect(report.checks.some((check) => check.id === 'safety_limits')).toBe(true);
    expect(report.checks.find((check) => check.id === 'safety_limits')?.status).toBe('ok');
  });
});
