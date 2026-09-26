import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationRunner, operationSchemas, validateOperation } from '../src/operations.js';

test('validates operation kinds and core input shapes', () => {
  assert.deepEqual(validateOperation('clarify', { title: 'Call the dentist' }), { title: 'Call the dentist' });
  assert.throws(() => validateOperation('x', {}), /Unsupported operation kind/);
  assert.throws(() => validateOperation('metadata', { title: 'Write', extra: true }), /unsupported field/);
  assert.throws(() => validateOperation('review', { items: [{ id: 'x', title: 'T', daysStale: 3, status: 'done' }] }), /review item shape/);
  assert.throws(() => validateOperation('breakdown', { title: 'x'.repeat(9000) }), /must be a string/);
});

test('uses read-only isolated SDK options and normalizes nullable metadata fields', async () => {
  let options;
  let prompt;
  let schema;
  const codex = { startThread(value) {
    options = value;
    return { async run(input, turnOptions) {
      prompt = input;
      schema = turnOptions.outputSchema;
      return { finalResponse: JSON.stringify({ context: null, timeEstimate: 'custom:75', tags: ['#writing'] }) };
    } };
  } };
  const run = createOperationRunner({ codex, workingDirectory: '/isolated/empty-dir' });
  const result = await run('metadata', { title: 'Draft outline', contexts: ['@desk'] });
  assert.deepEqual(result, { timeEstimate: 'custom:75', tags: ['#writing'] });
  assert.equal(options.workingDirectory, '/isolated/empty-dir');
  assert.equal(options.sandboxMode, 'read-only');
  assert.equal(options.approvalPolicy, 'never');
  assert.equal(options.skipGitRepoCheck, true);
  assert.equal(options.networkAccessEnabled, false);
  assert.match(prompt, /Do not use tools, run commands, inspect files/);
  assert.deepEqual(schema, operationSchemas.metadata);
});

test('normalizes clarify nullable optional fields to Mindwtr shape', async () => {
  const codex = { startThread: () => ({ run: async () => ({ finalResponse: JSON.stringify({
    question: 'What does done mean?', options: [{ label: 'Draft it', action: 'Draft the outline' }],
    suggestedAction: { title: 'Draft the outline', timeEstimate: null, context: null, isProject: false },
  }) }) }) };
  const result = await createOperationRunner({ codex, workingDirectory: '/empty' })('clarify', { title: 'Outline' });
  assert.deepEqual(result, { question: 'What does done mean?', options: [{ label: 'Draft it', action: 'Draft the outline' }], suggestedAction: { title: 'Draft the outline', isProject: false } });
});

test('returns generic errors for invalid model output', async () => {
  const codex = { startThread: () => ({ run: async () => ({ finalResponse: 'not-json' }) }) };
  await assert.rejects(createOperationRunner({ codex, workingDirectory: '/empty' })('breakdown', { title: 'Plan move' }), (error) => error.status === 502 && error.code === 'invalid_result' && error.message === 'Codex returned an invalid result.');
});

test('aborts a long-running SDK call on timeout', async () => {
  const codex = { startThread: () => ({ run: (_prompt, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })) }) };
  await assert.rejects(createOperationRunner({ codex, workingDirectory: '/empty', timeoutMs: 10 })('breakdown', { title: 'Plan move' }), (error) => error.status === 504 && error.code === 'operation_timeout');
});
