import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = 4487;
let processHandle;
let dataDir;
let base;

async function waitForHealth() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/v1/health`);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error('API did not start');
}

async function json(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();
  return { response, payload };
}

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'idea-planet-api-'));
  base = `http://127.0.0.1:${port}`;
  processHandle = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, IDEA_PLANET_PORT: String(port), IDEA_PLANET_DB: join(dataDir, 'test.sqlite') },
    stdio: 'ignore'
  });
  await waitForHealth();
});

after(async () => {
  processHandle?.kill('SIGTERM');
  await rm(dataDir, { recursive: true, force: true });
});

test('requires authentication for user data', async () => {
  const result = await json(`${base}/api/v1/ideas`);
  assert.equal(result.response.status, 401);
  assert.equal(result.payload.error, 'unauthorized');
});

test('creates, updates and pulls an Idea through the API', async () => {
  const session = await json(`${base}/api/v1/auth/dev-session`, { method: 'POST' });
  assert.equal(session.response.status, 200);
  const auth = { Authorization: `Bearer ${session.payload.token}` };

  const created = await json(`${base}/api/v1/ideas`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'api-test-idea', sourceType: 'direct', title: 'First API Idea', body: 'A body', tags: ['Method'] })
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.payload.idea.id, 'api-test-idea');
  assert.equal(created.payload.idea.revision, 1);
  assert.deepEqual(created.payload.idea.tags, ['Method']);

  const updated = await json(`${base}/api/v1/ideas/api-test-idea`, {
    method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'Updated body', myThought: 'My context' })
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.payload.idea.body, 'Updated body');
  assert.equal(updated.payload.idea.myThought, 'My context');
  assert.equal(updated.payload.idea.revision, 2);

  const conflict = await json(`${base}/api/v1/ideas/api-test-idea`, {
    method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: 1, body: 'stale write' })
  });
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.payload.error, 'revision_conflict');

  const list = await json(`${base}/api/v1/ideas`, { headers: auth });
  assert.equal(list.response.status, 200);
  assert.equal(list.payload.ideas.length, 1);

  const changes = await json(`${base}/api/v1/sync/pull?after=0`, { headers: auth });
  assert.equal(changes.response.status, 200);
  assert.equal(changes.payload.changes.length, 2);
  assert.equal(changes.payload.ideas.at(-1).body, 'Updated body');
});

test('soft deletes an Idea and exposes a sync tombstone', async () => {
  const session = await json(`${base}/api/v1/auth/dev-session`, { method: 'POST' });
  const auth = { Authorization: `Bearer ${session.payload.token}`, 'Content-Type': 'application/json' };
  const created = await json(`${base}/api/v1/ideas`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ id: 'tombstone-idea', body: 'to be removed' })
  });
  assert.equal(created.payload.idea.revision, 1);
  const deleted = await json(`${base}/api/v1/ideas/tombstone-idea?revision=1`, { method: 'DELETE', headers: auth });
  assert.equal(deleted.response.status, 200);
  assert.ok(deleted.payload.idea.deletedAt);
  const list = await json(`${base}/api/v1/ideas`, { headers: auth });
  assert.equal(list.payload.ideas.some(idea => idea.id === 'tombstone-idea'), false);
  const changes = await json(`${base}/api/v1/sync/pull?after=0`, { headers: auth });
  const tombstone = changes.payload.changes.find(change => change.entityId === 'tombstone-idea' && change.deletedAt);
  assert.ok(tombstone);
});

test('push is idempotent by user and idea id', async () => {
  const session = await json(`${base}/api/v1/auth/dev-session`, { method: 'POST' });
  const auth = { Authorization: `Bearer ${session.payload.token}`, 'Content-Type': 'application/json' };
  const payload = { ideas: [{ id: 'sync-idea', sourceType: 'bookmark', body: 'same id' }] };
  const first = await json(`${base}/api/v1/sync/push`, { method: 'POST', headers: auth, body: JSON.stringify(payload) });
  const second = await json(`${base}/api/v1/sync/push`, { method: 'POST', headers: auth, body: JSON.stringify(payload) });
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  const list = await json(`${base}/api/v1/ideas`, { headers: { Authorization: auth.Authorization } });
  assert.equal(list.payload.ideas.filter(idea => idea.id === 'sync-idea').length, 1);
});

test('stores typed Idea relations and includes them in the sync stream', async () => {
  const session = await json(`${base}/api/v1/auth/dev-session`, { method: 'POST' });
  const auth = { Authorization: `Bearer ${session.payload.token}`, 'Content-Type': 'application/json' };
  for (const id of ['relation-from', 'relation-to']) {
    await json(`${base}/api/v1/ideas`, { method: 'POST', headers: auth, body: JSON.stringify({ id, body: id }) });
  }
  const child = await json(`${base}/api/v1/ideas`, { method: 'POST', headers: auth, body: JSON.stringify({ id: 'relation-child', body: 'child', parentId: 'relation-from', relationType: 'extends' }) });
  assert.equal(child.response.status, 201);
  const created = await json(`${base}/api/v1/relations`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ fromIdeaId: 'relation-from', toIdeaId: 'relation-to', relationType: 'extends', metadata: { confidence: 0.8 } })
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.payload.relation.relationType, 'extends');
  assert.deepEqual(created.payload.relation.metadata, { confidence: 0.8 });
  const list = await json(`${base}/api/v1/relations?ideaId=relation-from`, { headers: auth });
  assert.equal(list.payload.relations.length, 2);
  const changes = await json(`${base}/api/v1/sync/pull?after=0`, { headers: auth });
  assert.ok(changes.payload.relations.some(relation => relation.id === created.payload.relation.id));
});

test('runs the local Recall Agent through the durable task lifecycle', async () => {
  const session = await json(`${base}/api/v1/auth/dev-session`, { method: 'POST' });
  const auth = { Authorization: `Bearer ${session.payload.token}`, 'Content-Type': 'application/json' };
  await json(`${base}/api/v1/ideas`, { method: 'POST', headers: auth, body: JSON.stringify({ id: 'agent-context', title: 'Personal context', body: 'A useful idea about context and memory.' }) });
  const created = await json(`${base}/api/v1/agent/tasks`, {
    method: 'POST', headers: auth, body: JSON.stringify({ type: 'recall', prompt: 'context memory' })
  });
  assert.equal(created.response.status, 202);
  let detail;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    detail = await json(`${base}/api/v1/agent/tasks/${created.payload.task.id}`, { headers: auth });
    if (detail.payload.task.status !== 'queued' && detail.payload.task.status !== 'running') break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(detail.payload.task.status, 'succeeded');
  assert.equal(detail.payload.outputs[0].type, 'recall');
  assert.ok(detail.payload.events.some(event => event.type === 'context.ready'));
  assert.ok(detail.payload.events.some(event => event.type === 'run.completed'));
  const saved = await json(`${base}/api/v1/agent/outputs/${detail.payload.outputs[0].id}/save-as-idea`, {
    method: 'POST', headers: auth, body: JSON.stringify({ title: 'Recall result' })
  });
  assert.equal(saved.response.status, 201);
  assert.equal(saved.payload.idea.sourceType, 'direct');
  assert.match(saved.payload.idea.body, /相关 Idea/);

  const cancelled = await json(`${base}/api/v1/agent/tasks/${created.payload.task.id}/cancel`, { method: 'POST', headers: auth });
  assert.equal(cancelled.response.status, 409);
  assert.equal(cancelled.payload.error, 'conflict');

  const unsupported = await json(`${base}/api/v1/agent/tasks`, {
    method: 'POST', headers: auth, body: JSON.stringify({ type: 'draft', prompt: 'draft something' })
  });
  let unsupportedDetail;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    unsupportedDetail = await json(`${base}/api/v1/agent/tasks/${unsupported.payload.task.id}`, { headers: auth });
    if (unsupportedDetail.payload.task.status !== 'queued' && unsupportedDetail.payload.task.status !== 'running') break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(unsupportedDetail.payload.task.status, 'failed');
  assert.equal(unsupportedDetail.payload.task.error.code, 'PROVIDER_UNAVAILABLE');
});

test('keeps tags and boards behind the authenticated workspace API', async () => {
  const session = await json(`${base}/api/v1/auth/dev-session`, { method: 'POST' });
  const auth = { Authorization: `Bearer ${session.payload.token}`, 'Content-Type': 'application/json' };
  const tag = await json(`${base}/api/v1/tags`, { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Design' }) });
  assert.equal(tag.response.status, 201);
  const tags = await json(`${base}/api/v1/tags`, { headers: auth });
  assert.ok(tags.payload.tags.some(item => item.name === 'Design'));
  const board = await json(`${base}/api/v1/boards`, { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Design notes', query: { tags: ['Design'] }, pinned: true }) });
  assert.equal(board.response.status, 201);
  assert.equal(board.payload.board.pinned, true);
  const boards = await json(`${base}/api/v1/boards`, { headers: auth });
  assert.ok(boards.payload.boards.some(item => item.id === board.payload.board.id));
  const deleted = await json(`${base}/api/v1/boards/${board.payload.board.id}?revision=${board.payload.board.revision}`, { method: 'DELETE', headers: auth });
  assert.equal(deleted.response.status, 200);
});
