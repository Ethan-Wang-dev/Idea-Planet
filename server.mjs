import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  db, deleteIdea, deleteRelation, findIdea, listIdeas, listRelations, now,
  publicIdea, saveIdea, saveRelation, saveIdeasBatch
} from './db.mjs';
import { defaultAgentKernel } from './agent/kernel.mjs';
import { appendEvent, createTask, getOutput, getTask, listEvents, listOutputs, setTaskStatus } from './agent/repository.mjs';
import { createTag, deleteBoard, deleteTag, listBoards, listTags, saveBoard } from './workspace/repository.mjs';


const root = fileURLToPath(new URL('./app/', import.meta.url));
const port = Number(process.env.PORT || process.env.IDEA_PLANET_PORT || 4317);
const bodyLimit = 4 * 1024 * 1024;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function send(res, status, payload, headers = {}) {
  if (status === 204) { res.writeHead(204, headers); res.end(); return; }
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > bodyLimit) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON body'), { status: 400 }); }
}

function routePath(url) { return url.pathname.replace(/\/+/g, '/').replace(/\/$/, '') || '/'; }

async function api(req, res, url) {
  const path = routePath(url);
  const headers = {};
  if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return; }
  if (req.method === 'GET' && path === '/api/v1/health') {
    send(res, 200, { ok: true, service: 'idea-planet-api', time: now() }, headers); return;
  }
  const workspaceId = 'local';
  if (req.method === 'GET' && path === '/api/v1/ideas') {
    send(res, 200, { ideas: listIdeas(workspaceId, { includeDeleted: url.searchParams.get('includeDeleted') === 'true', limit: url.searchParams.get('limit') }) }, headers); return;
  }

  if (req.method === 'POST' && path === '/api/v1/ideas') {
    const payload = await readJson(req);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Object.assign(new Error('Idea payload must be an object'), { status: 400 });
    const result = saveIdea(workspaceId, payload);
    send(res, 201, result, headers); return;
  }
  if (req.method === 'POST' && path === '/api/v1/local/ideas/batch') {
    const payload = await readJson(req);
    if (!Array.isArray(payload.ideas)) throw Object.assign(new Error('Local batch requires an ideas array'), { status: 400 });
    const result = saveIdeasBatch(workspaceId, payload.ideas);
    send(res, 200, result, headers); return;
  }

  if (req.method === 'GET' && path === '/api/v1/relations') {
    send(res, 200, { relations: listRelations(workspaceId, url.searchParams.get('ideaId') || '', url.searchParams.get('includeDeleted') === 'true') }, headers); return;
  }
  if (req.method === 'POST' && path === '/api/v1/relations') {
    const payload = await readJson(req);
    send(res, 201, saveRelation(workspaceId, payload), headers); return;
  }
  const relationMatch = path.match(/^\/api\/v1\/relations\/([^/]+)$/);
  if (relationMatch && req.method === 'DELETE') {
    const id = decodeURIComponent(relationMatch[1]);
    const result = deleteRelation(workspaceId, id, url.searchParams.has('revision') ? url.searchParams.get('revision') : undefined);
    if (!result) { send(res, 404, { error: 'not_found', message: 'Relation not found.' }, headers); return; }
    send(res, 200, result, headers); return;
  }

  if (req.method === 'GET' && path === '/api/v1/tags') { send(res, 200, { tags: listTags(workspaceId) }, headers); return; }
  if (req.method === 'POST' && path === '/api/v1/tags') {
    const payload = await readJson(req); send(res, 201, { tag: createTag(workspaceId, payload.name) }, headers); return;
  }
  const tagMatch = path.match(/^\/api\/v1\/tags\/([^/]+)$/);
  if (tagMatch && req.method === 'DELETE') { deleteTag(workspaceId, decodeURIComponent(tagMatch[1])); send(res, 204, {}, headers); return; }

  if (req.method === 'GET' && path === '/api/v1/boards') {
    send(res, 200, { boards: listBoards(workspaceId, url.searchParams.get('includeDeleted') === 'true') }, headers); return;
  }
  if (req.method === 'POST' && path === '/api/v1/boards') {
    const payload = await readJson(req); send(res, 201, saveBoard(workspaceId, payload), headers); return;
  }
  const boardMatch = path.match(/^\/api\/v1\/boards\/([^/]+)$/);
  if (boardMatch && (req.method === 'PATCH' || req.method === 'DELETE')) {
    const id = decodeURIComponent(boardMatch[1]);
    if (req.method === 'DELETE') {
      const result = deleteBoard(workspaceId, id, url.searchParams.has('revision') ? url.searchParams.get('revision') : undefined);
      if (!result) { send(res, 404, { error: 'not_found', message: 'Board not found.' }, headers); return; }
      send(res, 200, result, headers); return;
    }
    const payload = await readJson(req); send(res, 200, saveBoard(workspaceId, { ...payload, id }), headers); return;
  }

  if (req.method === 'POST' && path === '/api/v1/agent/tasks') {
    const payload = await readJson(req);
    const task = createTask(workspaceId, payload);
    queueMicrotask(() => defaultAgentKernel.run(workspaceId, task.id).catch(error => console.error('Agent task failed to start', error)));
    send(res, 202, { task }, headers); return;
  }
  const taskMatch = path.match(/^\/api\/v1\/agent\/tasks\/([^/]+)$/);
  if (taskMatch && req.method === 'GET') {
    const task = getTask(workspaceId, decodeURIComponent(taskMatch[1]));
    if (!task) { send(res, 404, { error: 'not_found', message: 'Agent task not found.' }, headers); return; }
    send(res, 200, { task, events: listEvents(workspaceId, task.id), outputs: listOutputs(workspaceId, task.id) }, headers); return;
  }
  const taskCancelMatch = path.match(/^\/api\/v1\/agent\/tasks\/([^/]+)\/cancel$/);
  if (taskCancelMatch && req.method === 'POST') {
    const taskId = decodeURIComponent(taskCancelMatch[1]);
    const task = getTask(workspaceId, taskId);
    if (!task) { send(res, 404, { error: 'not_found', message: 'Agent task not found.' }, headers); return; }
    const cancelled = setTaskStatus(workspaceId, taskId, 'cancelled', { cancelledAt: now() });
    appendEvent(workspaceId, taskId, null, 'task.cancelled', {});
    send(res, 200, { task: cancelled }, headers); return;
  }
  const taskEventsMatch = path.match(/^\/api\/v1\/agent\/tasks\/([^/]+)\/events$/);
  if (taskEventsMatch && req.method === 'GET') {
    const taskId = decodeURIComponent(taskEventsMatch[1]);
    if (!getTask(workspaceId, taskId)) { send(res, 404, { error: 'not_found', message: 'Agent task not found.' }, headers); return; }
    send(res, 200, { events: listEvents(workspaceId, taskId, url.searchParams.get('after')) }, headers); return;
  }
  const outputSaveMatch = path.match(/^\/api\/v1\/agent\/outputs\/([^/]+)\/save-as-idea$/);
  if (outputSaveMatch && req.method === 'POST') {
    const output = getOutput(workspaceId, decodeURIComponent(outputSaveMatch[1]));
    if (!output) { send(res, 404, { error: 'not_found', message: 'Agent output not found.' }, headers); return; }
    const payload = await readJson(req);
    const text = String(payload.body || output.content?.text || '').trim();
    if (!text) throw Object.assign(new Error('Only text Agent outputs can be saved as an Idea'), { status: 400 });
    const idea = saveIdea(workspaceId, {
      id: payload.id, sourceType: 'direct', sourceTypes: ['direct'], author: 'Idea Planet Agent',
      title: String(payload.title || '').trim(), body: text, tags: Array.isArray(payload.tags) ? payload.tags : [],
      source: `Agent output · ${output.type}`, status: 'kept', createdAt: now()
    });
    appendEvent(workspaceId, output.taskId, output.runId, 'output.saved_as_idea', { outputId: output.id, ideaId: idea.idea.id });
    send(res, 201, idea, headers); return;
  }

  const ideaMatch = path.match(/^\/api\/v1\/ideas\/([^/]+)$/);
  if (ideaMatch && (req.method === 'GET' || req.method === 'PATCH' || req.method === 'DELETE')) {
    const id = decodeURIComponent(ideaMatch[1]);
    const existing = findIdea(workspaceId, id);
    if (!existing) { send(res, 404, { error: 'not_found', message: 'Idea not found.' }, headers); return; }
    if (req.method === 'GET') { send(res, 200, { idea: publicIdea(existing) }, headers); return; }
    if (req.method === 'DELETE') {
      const revision = url.searchParams.has('revision') ? url.searchParams.get('revision') : undefined;
      const result = deleteIdea(workspaceId, id, revision);
      send(res, 200, result, headers); return;
    }
    const payload = await readJson(req);
    const result = saveIdea(workspaceId, { ...publicIdea(existing), ...payload, id });
    send(res, 200, result, headers); return;
  }

  send(res, 404, { error: 'not_found', message: 'API route not found.' }, headers);
}

async function staticFile(req, res, url) {
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const target = normalize(join(root, file));
  if (!target.startsWith(root)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); return; }
  try {
    const contents = await readFile(target);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(contents);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
    if (!allowedHosts.has(url.hostname)) {
      send(res, 403, { error: 'local_only', message: 'Use a localhost address.' }); return;
    }
    const origin = req.headers.origin;
    if ((origin && origin !== url.origin) || req.headers['sec-fetch-site'] === 'cross-site') {
      send(res, 403, { error: 'cross_origin_denied', message: 'Local workspace only accepts same-origin requests.' }); return;
    }
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else await staticFile(req, res, url);
  } catch (error) {
    const status = Number(error?.status) || (error?.code === 'REVISION_CONFLICT' ? 409 : 500);
    if (!res.headersSent) send(res, status, {
      error: status === 500 ? 'internal_error' : status === 409 ? (error.code === 'REVISION_CONFLICT' ? 'revision_conflict' : 'conflict') : 'bad_request',
      message: status === 500 ? 'Unexpected server error.' : error.message,
      ...(status === 409 ? { idea: error.serverIdea } : {})
    });
    else res.end();
    if (status === 500) console.error(error);
  }
});

server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
server.keepAliveTimeout = 5_000;

server.listen(port, process.env.IDEA_PLANET_HOST || '127.0.0.1', () => console.log(`Idea Planet running at http://localhost:${port}`));

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Idea Planet shutting down (${signal})`);
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => { db.close(); process.exit(1); }, 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { server };
