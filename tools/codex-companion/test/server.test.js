import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthorizedBearerToken, createCompanionServer } from '../src/server.js';

const token = 'a-test-token-that-is-at-least-24-chars';

test('bearer auth uses the exact configured token', () => {
  assert.equal(isAuthorizedBearerToken(`Bearer ${token}`, token), true);
  assert.equal(isAuthorizedBearerToken(`Bearer ${token}x`, token), false);
  assert.equal(isAuthorizedBearerToken(token, token), false);
  assert.equal(isAuthorizedBearerToken(`Bearer ${token}`, undefined), false);
});

test('serves health and protects operation execution with bearer auth', async (t) => {
  let calls = 0;
  const server = createCompanionServer({ token, runOperation: async (kind, input) => { calls += 1; return { kind, title: input.title }; } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${origin}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  const rejected = await fetch(`${origin}/v1/operations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'metadata', input: { title: 'Hi' } }) });
  assert.equal(rejected.status, 401);
  assert.equal(calls, 0);
  const accepted = await fetch(`${origin}/v1/operations`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'metadata', input: { title: 'Hi' } }) });
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { result: { kind: 'metadata', title: 'Hi' } });
  assert.equal(calls, 1);
});

test('does not return exception details from the runner', async (t) => {
  const server = createCompanionServer({ token, runOperation: async () => { throw new Error(`secret ${token}`); } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/v1/operations`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'metadata', input: { title: 'Hi' } }) });
  assert.equal(response.status, 500);
  const text = await response.text();
  assert.equal(text.includes(token), false);
  assert.match(text, /operation could not be completed/);
});
