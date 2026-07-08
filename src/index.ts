#!/usr/bin/env node

import { createRequire } from 'node:module';
import { readImage } from './handlers/readImage.js';
import { createServer, http, stdio } from './mcp.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version: string };

const transportType = process.env['MCP_TRANSPORT'] ?? 'stdio';
const httpPort = Number.parseInt(process.env['MCP_HTTP_PORT'] ?? '8080', 10);
const httpHost = process.env['MCP_HTTP_HOST'] ?? '127.0.0.1';
const apiKey = process.env['MCP_API_KEY'];
const corsOrigin = process.env['MCP_CORS_ORIGIN'];

const isLoopbackHost = (host: string): boolean =>
  host === 'localhost' || host === '::1' || host === '127.0.0.1' || host.startsWith('127.');

function createTransport() {
  if (transportType === 'http') {
    return http({
      port: httpPort,
      hostname: httpHost,
      ...(corsOrigin ? { cors: corsOrigin } : {}),
      ...(apiKey ? { apiKey } : {}),
    });
  }
  return stdio();
}

const server = createServer({
  name: 'image-reader-mcp',
  version: packageJson.version,
  instructions:
    'Evidence-first image reader MCP server. Use read_image to extract measurable facts — dimensions, metadata, optional OCR text with bounding boxes, and trust warnings — without generative LLM.',
  tools: {
    read_image: readImage,
  },
  transport: createTransport(),
});

async function main(): Promise<void> {
  await server.start();

  if (transportType === 'http') {
    console.log(`[Image Reader MCP] Server running on http://${httpHost}:${httpPort}/mcp`);
    console.log(`[Image Reader MCP] Health check: http://${httpHost}:${httpPort}/mcp/health`);
    if (apiKey) {
      console.log('[Image Reader MCP] API key authentication enabled (X-API-Key header)');
    } else if (!isLoopbackHost(httpHost)) {
      console.warn(
        `[Image Reader MCP] WARNING: bound to non-loopback host ${httpHost} with no API key. ` +
          'Any client that can reach this port can read every image this process can access. ' +
          'Set MCP_API_KEY to require an X-API-Key header, or bind MCP_HTTP_HOST=127.0.0.1.'
      );
    }
    if (corsOrigin) {
      console.log(`[Image Reader MCP] CORS allowed origin: ${corsOrigin}`);
    }
    console.log('[Image Reader MCP] Project root:', process.cwd());
  } else if (process.env['DEBUG_MCP']) {
    console.error('[Image Reader MCP] Server running on stdio');
    console.error('[Image Reader MCP] Project root:', process.cwd());
  }
}

main().catch((error: unknown) => {
  console.error('[Image Reader MCP] Server error:', error);
  process.exit(1);
});
