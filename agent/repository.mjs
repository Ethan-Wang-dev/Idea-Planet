import { randomUUID } from 'node:crypto';
import { db, now } from '../db.mjs';

function json(value, fallback = {}) {
  try { return JSON.stringify(value ?? fallback); } catch { return JSON.stringify(fallback); }
}

function parse(value, fallback = {}) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function taskRow(workspaceId, id) { return db.prepare('SELECT * FROM agent_tasks WHERE workspace_id = ? AND id = ?').get(workspaceId, id); }
function runRow(workspaceId, id) { return db.prepare('SELECT * FROM agent_runs WHERE workspace_id = ? AND id = ?').get(workspaceId, id); }

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

export function createTask(workspaceId, input) {
  const type = String(input?.type || '').trim();
  const prompt = String(input?.prompt || '').trim();
  const allowed = new Set(['recall', 'synthesize', 'draft', 'research']);
  if (!allowed.has(type)) throw Object.assign(new Error(`Unsupported Agent task type: ${type || 'empty'}`), { status: 400 });
  if (!prompt) throw Object.assign(new Error('Agent task prompt is required'), { status: 400 });
  const id = String(input.id || randomUUID());
  const createdAt = now();
  db.prepare(`INSERT INTO agent_tasks (workspace_id, id, task_type, input_json, status, definition_version, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'queued', ?, ?, ?)`)
    .run(workspaceId, id, type, json({ prompt, options: input.options || {} }), String(input.definitionVersion || 'v1'), createdAt, createdAt);
  appendEvent(workspaceId, id, null, 'task.queued', { type });
  return publicTask(taskRow(workspaceId, id));
}

export function getTask(workspaceId, id) { return publicTask(taskRow(workspaceId, id)); }

export function setTaskStatus(workspaceId, id, status, { error, cancelledAt } = {}) {
  const updatedAt = now();
  const task = taskRow(workspaceId, id);
  if (!task) return null;
  const transitions = {
    queued: new Set(['running', 'cancelled']),
    running: new Set(['succeeded', 'failed', 'cancelled']),
    succeeded: new Set(), failed: new Set(), cancelled: new Set()
  };
  if (task.status !== status && !transitions[task.status]?.has(status)) {
    throw Object.assign(new Error(`Invalid Agent task transition: ${task.status} -> ${status}`), { status: 409, code: 'INVALID_TASK_TRANSITION' });
  }
  db.prepare('UPDATE agent_tasks SET status = ?, updated_at = ?, cancelled_at = ?, error_json = ? WHERE workspace_id = ? AND id = ?')
    .run(status, updatedAt, cancelledAt || task.cancelled_at || null, error ? json(error) : task.error_json || null, workspaceId, id);
  return publicTask(taskRow(workspaceId, id));
}

export function createRun(workspaceId, taskId, { provider = null, model = null } = {}) {
  const id = randomUUID();
  db.prepare(`INSERT INTO agent_runs (workspace_id, id, task_id, status, provider, model)
    VALUES (?, ?, ?, 'running', ?, ?)`)
    .run(workspaceId, id, taskId, provider, model);
  appendEvent(workspaceId, taskId, id, 'run.started', { provider, model });
  return publicRun(runRow(workspaceId, id));
}

export function finishRun(workspaceId, runId, status, error = null) {
  const finishedAt = now();
  db.prepare('UPDATE agent_runs SET status = ?, finished_at = ?, error_json = ? WHERE workspace_id = ? AND id = ?')
    .run(status, finishedAt, error ? json(error) : null, workspaceId, runId);
  return publicRun(runRow(workspaceId, runId));
}

export function appendEvent(workspaceId, taskId, runId, eventType, payload = {}) {
  const result = db.prepare(`INSERT INTO agent_events (workspace_id, task_id, run_id, event_type, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(workspaceId, taskId, runId, eventType, json(payload), now());
  return db.prepare('SELECT seq, task_id, run_id, event_type, payload_json, created_at FROM agent_events WHERE seq = ?')
    .get(result.lastInsertRowid);
}

export function listEvents(workspaceId, taskId, after = 0) {
  return db.prepare(`SELECT seq, task_id, run_id, event_type, payload_json, created_at FROM agent_events
    WHERE workspace_id = ? AND task_id = ? AND seq > ? ORDER BY seq ASC`).all(workspaceId, taskId, Number(after) || 0)
    .map(row => ({ seq: row.seq, taskId: row.task_id, runId: row.run_id || undefined, type: row.event_type, payload: parse(row.payload_json), createdAt: row.created_at }));
}

export function saveOutput(workspaceId, { taskId, runId = null, type, content }) {
  const id = randomUUID();
  const createdAt = now();
  db.prepare(`INSERT INTO agent_outputs (workspace_id, id, task_id, run_id, output_type, content_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(workspaceId, id, taskId, runId, type, json(content), createdAt);
  return publicOutput(db.prepare('SELECT * FROM agent_outputs WHERE workspace_id = ? AND id = ?').get(workspaceId, id));
}

export function listOutputs(workspaceId, taskId) {
  return db.prepare('SELECT * FROM agent_outputs WHERE workspace_id = ? AND task_id = ? ORDER BY created_at ASC').all(workspaceId, taskId).map(publicOutput);
}

export function getOutput(workspaceId, id) {
  return publicOutput(db.prepare('SELECT * FROM agent_outputs WHERE workspace_id = ? AND id = ?').get(workspaceId, id));
}
