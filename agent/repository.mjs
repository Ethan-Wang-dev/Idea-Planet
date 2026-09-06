import { randomUUID } from 'node:crypto';
import { db, now } from '../db.mjs';

function json(value, fallback = {}) {
  try { return JSON.stringify(value ?? fallback); } catch { return JSON.stringify(fallback); }
}

function parse(value, fallback = {}) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function taskRow(userId, id) { return db.prepare('SELECT * FROM agent_tasks WHERE user_id = ? AND id = ?').get(userId, id); }
function runRow(userId, id) { return db.prepare('SELECT * FROM agent_runs WHERE user_id = ? AND id = ?').get(userId, id); }

export function publicTask(row) {
  if (!row) return null;
  return {
    id: row.id, type: row.task_type, input: parse(row.input_json), status: row.status,
    definitionVersion: row.definition_version, createdAt: row.created_at, updatedAt: row.updated_at,
    cancelledAt: row.cancelled_at || undefined, error: parse(row.error_json, undefined)
  };
}

export function publicRun(row) {
  if (!row) return null;
  return {
    id: row.id, taskId: row.task_id, status: row.status, provider: row.provider || undefined,
    model: row.model || undefined, startedAt: row.started_at || undefined,
    finishedAt: row.finished_at || undefined, error: parse(row.error_json, undefined)
  };
}

export function publicOutput(row) {
  if (!row) return null;
  return { id: row.id, taskId: row.task_id, runId: row.run_id || undefined, type: row.output_type, content: parse(row.content_json), createdAt: row.created_at };
}

export function createTask(userId, input) {
  const type = String(input?.type || '').trim();
  const prompt = String(input?.prompt || '').trim();
  const allowed = new Set(['recall', 'synthesize', 'draft', 'research']);
  if (!allowed.has(type)) throw Object.assign(new Error(`Unsupported Agent task type: ${type || 'empty'}`), { status: 400 });
  if (!prompt) throw Object.assign(new Error('Agent task prompt is required'), { status: 400 });
  const id = String(input.id || randomUUID());
  const createdAt = now();
  db.prepare(`INSERT INTO agent_tasks (user_id, id, task_type, input_json, status, definition_version, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'queued', ?, ?, ?)`)
    .run(userId, id, type, json({ prompt, options: input.options || {} }), String(input.definitionVersion || 'v1'), createdAt, createdAt);
  appendEvent(userId, id, null, 'task.queued', { type });
  return publicTask(taskRow(userId, id));
}

export function getTask(userId, id) { return publicTask(taskRow(userId, id)); }

export function setTaskStatus(userId, id, status, { error, cancelledAt } = {}) {
  const updatedAt = now();
  const task = taskRow(userId, id);
  if (!task) return null;
  const transitions = {
    queued: new Set(['running', 'cancelled']),
    running: new Set(['succeeded', 'failed', 'cancelled']),
    succeeded: new Set(), failed: new Set(), cancelled: new Set()
  };
  if (task.status !== status && !transitions[task.status]?.has(status)) {
    throw Object.assign(new Error(`Invalid Agent task transition: ${task.status} -> ${status}`), { status: 409, code: 'INVALID_TASK_TRANSITION' });
  }
  db.prepare('UPDATE agent_tasks SET status = ?, updated_at = ?, cancelled_at = ?, error_json = ? WHERE user_id = ? AND id = ?')
    .run(status, updatedAt, cancelledAt || task.cancelled_at || null, error ? json(error) : task.error_json || null, userId, id);
  return publicTask(taskRow(userId, id));
}

export function createRun(userId, taskId, { provider = null, model = null } = {}) {
  const id = randomUUID();
  db.prepare(`INSERT INTO agent_runs (user_id, id, task_id, status, provider, model)
    VALUES (?, ?, ?, 'running', ?, ?)`)
    .run(userId, id, taskId, provider, model);
  appendEvent(userId, taskId, id, 'run.started', { provider, model });
  return publicRun(runRow(userId, id));
}

export function finishRun(userId, runId, status, error = null) {
  const finishedAt = now();
  db.prepare('UPDATE agent_runs SET status = ?, finished_at = ?, error_json = ? WHERE user_id = ? AND id = ?')
    .run(status, finishedAt, error ? json(error) : null, userId, runId);
  return publicRun(runRow(userId, runId));
}

export function appendEvent(userId, taskId, runId, eventType, payload = {}) {
  const result = db.prepare(`INSERT INTO agent_events (user_id, task_id, run_id, event_type, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(userId, taskId, runId, eventType, json(payload), now());
  return db.prepare('SELECT seq, task_id, run_id, event_type, payload_json, created_at FROM agent_events WHERE seq = ?')
    .get(result.lastInsertRowid);
}

export function listEvents(userId, taskId, after = 0) {
  return db.prepare(`SELECT seq, task_id, run_id, event_type, payload_json, created_at FROM agent_events
    WHERE user_id = ? AND task_id = ? AND seq > ? ORDER BY seq ASC`).all(userId, taskId, Number(after) || 0)
    .map(row => ({ seq: row.seq, taskId: row.task_id, runId: row.run_id || undefined, type: row.event_type, payload: parse(row.payload_json), createdAt: row.created_at }));
}

export function saveOutput(userId, { taskId, runId = null, type, content }) {
  const id = randomUUID();
  const createdAt = now();
  db.prepare(`INSERT INTO agent_outputs (user_id, id, task_id, run_id, output_type, content_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, id, taskId, runId, type, json(content), createdAt);
  return publicOutput(db.prepare('SELECT * FROM agent_outputs WHERE user_id = ? AND id = ?').get(userId, id));
}

export function listOutputs(userId, taskId) {
  return db.prepare('SELECT * FROM agent_outputs WHERE user_id = ? AND task_id = ? ORDER BY created_at ASC').all(userId, taskId).map(publicOutput);
}

export function getOutput(userId, id) {
  return publicOutput(db.prepare('SELECT * FROM agent_outputs WHERE user_id = ? AND id = ?').get(userId, id));
}
