const GPS_FIELD_PATTERN = /^(gps|geo|location|latitude|longitude|altitude|coordinates)/i;

const GPS_NESTED_KEYS = new Set([
  'latitude',
  'longitude',
  'altitude',
  'lat',
  'lon',
  'lng',
  'GPSLatitude',
  'GPSLongitude',
  'GPSAltitude',
  'GPSLatitudeRef',
  'GPSLongitudeRef',
  'GPSAltitudeRef',
  'GPSDateStamp',
  'GPSTimeStamp',
  'GPSProcessingMethod',
  'GPSAreaInformation',
  'GPSDOP',
  'GPSMapDatum',
  'GPSDestLatitude',
  'GPSDestLongitude',
  'GPSDestBearing',
  'GPSDestDistance',
  'GPSHPositioningError',
]);

const isGpsKey = (key: string): boolean => GPS_FIELD_PATTERN.test(key) || GPS_NESTED_KEYS.has(key);

const redactValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value !== null && typeof value === 'object') {
    return redactGpsFields(value as Record<string, unknown>).metadata;
  }

  return '[redacted]';
};

export const redactGpsFields = (
  metadata: Record<string, unknown>
): { metadata: Record<string, unknown>; hadGps: boolean } => {
  let hadGps = false;
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (key.toLowerCase() === 'gps' && value !== null && typeof value === 'object') {
      hadGps = true;
      redacted[key] = '[redacted]';
      continue;
    }

    if (isGpsKey(key)) {
      hadGps = true;
      redacted[key] = redactValue(value);
      continue;
    }

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const nested = redactGpsFields(value as Record<string, unknown>);
      if (nested.hadGps) hadGps = true;
      redacted[key] = nested.metadata;
      continue;
    }

    redacted[key] = value;
  }

  return { metadata: redacted, hadGps };
};

export const collectTrustWarnings = (
  metadata: Record<string, unknown>,
  hadGps: boolean
): string[] => {
  const warnings: string[] = [];

  if (hadGps) {
    warnings.push(
      'GPS coordinates were present in metadata and have been redacted from the response.'
    );
  }

  const software = metadata['Software'] ?? metadata['software'];
  if (
    typeof software === 'string' &&
    /photoshop|gimp|ai|generative|midjourney|stable diffusion/i.test(software)
  ) {
    warnings.push(
      `EXIF Software field suggests possible editing or synthetic origin: "${software}".`
    );
  }

  const make = metadata['Make'] ?? metadata['make'];
  const model = metadata['Model'] ?? metadata['model'];
  if (
    typeof make === 'string' &&
    typeof model === 'string' &&
    /unknown|fake|synthetic/i.test(`${make} ${model}`)
  ) {
    warnings.push('Camera make/model metadata looks inconsistent or synthetic.');
  }

  return warnings;
};
