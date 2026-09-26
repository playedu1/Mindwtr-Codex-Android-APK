import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createOperationRunner, MAX_INPUT_BYTES } from './operations.js';

const MAX_CONCURRENT_OPERATIONS = 2;

export function isAuthorizedBearerToken(header, expectedToken) {
  if (typeof header !== 'string' || typeof expectedToken !== 'string' || !header.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(payload);
}

async function readJsonBody(request) {
  const contentType = request.headers['content-type'] ?? '';
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    const error = new Error('Content-Type must be application/json.');
    error.status = 415;
    error.code = 'unsupported_media_type';
    throw error;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) {
      const error = new Error('Request body is too large.');
      error.status = 413;
      error.code = 'request_too_large';
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.status = 400;
    error.code = 'invalid_json';
    throw error;
  }
}

export function createCompanionServer({ token, runOperation = createOperationRunner(), maxConcurrent = MAX_CONCURRENT_OPERATIONS } = {}) {
  if (typeof token !== 'string' || token.length < 24) throw new Error('MINDWTR_CODEX_TOKEN must be at least 24 characters.');
  let active = 0;
  const server = createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }
    if (request.method !== 'POST' || request.url !== '/v1/operations') {
      sendJson(response, 404, { error: 'Not found.', code: 'not_found' });
      return;
    }
    if (!isAuthorizedBearerToken(request.headers.authorization, token)) {
      sendJson(response, 401, { error: 'Unauthorized.', code: 'unauthorized' });
      return;
    }
    if (active >= maxConcurrent) {
      sendJson(response, 503, { error: 'Service is busy. Try again shortly.', code: 'busy' });
      return;
    }
    active += 1;
    try {
      const body = await readJsonBody(request);
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !['kind', 'input'].includes(key))) {
        sendJson(response, 400, { error: 'Request must contain only kind and input.', code: 'invalid_request' });
        return;
      }
      const result = await runOperation(body.kind, body.input);
      sendJson(response, 200, { result });
    } catch (error) {
      const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
      const code = typeof error?.code === 'string' ? error.code : 'internal_error';
      const message = status === 500 ? 'The operation could not be completed.' : error.message;
      sendJson(response, status, { error: message, code });
    } finally {
      active -= 1;
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  return server;
}

function parsePort(value) {
  const port = Number(value ?? 8787);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('MINDWTR_CODEX_PORT must be a valid TCP port.');
  return port;
}

export async function startCompanionServer({ env = process.env, runOperation } = {}) {
  const token = env.MINDWTR_CODEX_TOKEN;
  const host = env.MINDWTR_CODEX_HOST || '127.0.0.1';
  if (host !== 'localhost' && !isIP(host)) throw new Error('MINDWTR_CODEX_HOST must be localhost or an IP address.');
  const server = createCompanionServer({ token, runOperation });
  const port = parsePort(env.MINDWTR_CODEX_PORT);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const server = await startCompanionServer();
    const address = server.address();
    process.stdout.write(`Mindwtr Codex companion listening on ${typeof address === 'object' ? `${address.address}:${address.port}` : address}\n`);
    const stop = () => server.close(() => process.exit(0));
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch {
    process.stderr.write('Mindwtr Codex companion failed to start. Set a MINDWTR_CODEX_TOKEN of at least 24 characters.\n');
    process.exitCode = 1;
  }
}
