import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { IMAGE_SAFETY_LIMITS } from './utils/safety.js';

export type DoctorStatus = 'ok' | 'warn' | 'fail';

export interface DoctorCheck {
  id: string;
  status: DoctorStatus;
  message: string;
}

export interface DoctorReport {
  profile: 'image_reader_doctor';
  version: string;
  status: 'ready' | 'degraded' | 'unavailable';
  checks: DoctorCheck[];
}

const probeTesseract = (): DoctorCheck => {
  const result = spawnSync('tesseract', ['--version'], {
    encoding: 'utf8',
    timeout: 2_500,
  });

  if (result.status === 0) {
    const versionLine = (result.stdout || result.stderr || '').split('\n')[0]?.trim();
    return {
      id: 'tesseract',
      status: 'ok',
      message: versionLine ? `Tesseract available (${versionLine})` : 'Tesseract available',
    };
  }

  return {
    id: 'tesseract',
    status: 'warn',
    message:
      'Tesseract is not installed. OCR is optional; read_image still returns dimensions and metadata.',
  };
};

const probeSharp = async (): Promise<DoctorCheck> => {
  try {
    const buffer = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    if (buffer.length === 0) {
      return {
        id: 'sharp',
        status: 'fail',
        message: 'sharp failed to produce a probe image buffer.',
      };
    }

    return {
      id: 'sharp',
      status: 'ok',
      message: `sharp decode pipeline is available (v${sharp.versions.sharp}).`,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: 'sharp',
      status: 'fail',
      message: `sharp probe failed: ${message}`,
    };
  }
};

const probeSafetyLimits = (): DoctorCheck => {
  if (IMAGE_SAFETY_LIMITS.maxFileBytes > 0 && IMAGE_SAFETY_LIMITS.maxPixels > 0) {
    return {
      id: 'safety_limits',
      status: 'ok',
      message: `Safety limits active: ${IMAGE_SAFETY_LIMITS.maxFileBytes} bytes, ${IMAGE_SAFETY_LIMITS.maxPixels} pixels.`,
    };
  }

  return {
    id: 'safety_limits',
    status: 'fail',
    message: 'Safety limits are not configured.',
  };
};

const probeNode = (): DoctorCheck => {
  const version = process.versions.node;
  const major = Number.parseInt(version.split('.')[0] ?? '0', 10);
  if (major >= 22) {
    return {
      id: 'node',
      status: 'ok',
      message: `Node.js ${version} meets the >=22.13 requirement.`,
    };
  }

  return {
    id: 'node',
    status: 'warn',
    message: `Node.js ${version} is below the recommended >=22.13 runtime.`,
  };
};

const aggregateStatus = (checks: DoctorCheck[]): DoctorReport['status'] => {
  if (checks.some((check) => check.status === 'fail')) {
    return 'unavailable';
  }
  if (checks.some((check) => check.status === 'warn')) {
    return 'degraded';
  }
  return 'ready';
};

export async function runDoctor(version: string): Promise<DoctorReport> {
  const checks = [probeNode(), probeSafetyLimits(), await probeSharp(), probeTesseract()];
  return {
    profile: 'image_reader_doctor',
    version,
    status: aggregateStatus(checks),
    checks,
  };
}

export function formatDoctorReport(report: DoctorReport): string {
  return JSON.stringify(report, null, 2);
}
