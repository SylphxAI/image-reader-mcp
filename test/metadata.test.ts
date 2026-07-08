import { describe, expect, it } from 'bun:test';
import { collectTrustWarnings, redactGpsFields } from '../src/utils/metadata.js';

describe('metadata utilities', () => {
  it('redacts GPS fields and records presence', () => {
    const { metadata, hadGps } = redactGpsFields({
      Make: 'TestCam',
      GPSLatitude: 37.7749,
      GPSLongitude: -122.4194,
      gps: {
        latitude: 37.7749,
        longitude: -122.4194,
      },
    });

    expect(hadGps).toBe(true);
    expect(metadata['GPSLatitude']).toBe('[redacted]');
    expect(metadata['GPSLongitude']).toBe('[redacted]');
    expect(metadata['gps']).toBe('[redacted]');
    expect(metadata['Make']).toBe('TestCam');
  });

  it('adds trust warnings for GPS and suspicious software', () => {
    const warnings = collectTrustWarnings(
      {
        Software: 'Adobe Photoshop',
        Make: 'Unknown',
        Model: 'Synthetic Camera',
      },
      true
    );

    expect(warnings.some((warning) => warning.includes('GPS coordinates'))).toBe(true);
    expect(warnings.some((warning) => warning.includes('Software field'))).toBe(true);
  });
});
