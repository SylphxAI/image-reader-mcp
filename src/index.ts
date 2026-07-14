#!/usr/bin/env node

import { createRequire } from 'node:module';
import { formatDoctorReport, runDoctor } from './doctor.js';
import { readImage } from './handlers/readImage.js';
import { createServer, stdio } from './mcp.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version: string };

const server = createServer({
  name: 'image-reader-mcp',
  version: packageJson.version,
  instructions:
    'Evidence-first image reader MCP server. Use read_image to extract measurable facts — dimensions, metadata, optional OCR text with bounding boxes, and trust warnings — without generative LLM.',
  tools: {
    read_image: readImage,
  },
  transport: stdio(),
});

async function main(): Promise<void> {
  if (process.argv[2] === 'doctor') {
    const report = await runDoctor(packageJson.version);
    console.log(formatDoctorReport(report));
    process.exit(report.status === 'unavailable' ? 1 : 0);
  }

  await server.start();

  if (process.env['DEBUG_MCP']) {
    console.error('[Image Reader MCP] Server running on stdio');
    console.error('[Image Reader MCP] Project root:', process.cwd());
  }
}

main().catch((error: unknown) => {
  console.error('[Image Reader MCP] Server error:', error);
  process.exit(1);
});