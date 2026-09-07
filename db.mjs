import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';

const defaultPath = process.env.IDEA_PLANET_DB || new URL('./.data/local-planet.sqlite', import.meta.url).pathname;
if (defaultPath !== ':memory:') mkdirSync(dirname(defaultPath), { recursive: true });

export const db = new Database(defaultPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get()) {
  db.close();
  throw new Error('Legacy account database detected. It was left untouched. Use a new IDEA_PLANET_DB path and import your exported Ideas.');
}
db.exec(`
  CREATE TABLE IF NOT EXISTS ideas (
    workspace_id TEXT NOT NULL CHECK (workspace_id = 'local'),
    id TEXT NOT NULL,
    capture_id TEXT,
    capture_key TEXT,
    source_type TEXT NOT NULL DEFAULT 'direct',
    source_types_json TEXT NOT NULL DEFAULT '[]',
    content_type TEXT NOT NULL DEFAULT 'post',
    relation_type TEXT,
    parent_id TEXT,
    parent_url TEXT,
    parent_snapshot_json TEXT,
    author TEXT,
    title TEXT,
    body TEXT NOT NULL DEFAULT '',
    body_html TEXT,
    source TEXT,
    url TEXT,
    content_status TEXT,
    created_at TEXT NOT NULL,
    captured_at TEXT,
    status TEXT NOT NULL DEFAULT 'kept',
    my_thought TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    legacy_practice_json TEXT,
    created_at_server TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT,
    PRIMARY KEY (workspace_id, id)
  );

  CREATE INDEX IF NOT EXISTS ideas_workspace_updated_idx ON ideas(workspace_id, updated_at, id);
  CREATE INDEX IF NOT EXISTS ideas_workspace_url_idx ON ideas(workspace_id, url);

  CREATE TABLE IF NOT EXISTS idea_relations (
    workspace_id TEXT NOT NULL CHECK (workspace_id = 'local'),
    id TEXT NOT NULL,
    from_idea_id TEXT NOT NULL,
    to_idea_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    PRIMARY KEY (workspace_id, id),
    UNIQUE (workspace_id, from_idea_id, to_idea_id, relation_type)
  );

  CREATE INDEX IF NOT EXISTS idea_relations_workspace_from_idx ON idea_relations(workspace_id, from_idea_id);
  CREATE INDEX IF NOT EXISTS idea_relations_workspace_to_idx ON idea_relations(workspace_id, to_idea_id);

  CREATE TABLE IF NOT EXISTS tags (
    workspace_id TEXT NOT NULL CHECK (workspace_id = 'local'),
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (workspace_id, name)
  );

  CREATE TABLE IF NOT EXISTS boards (
    workspace_id TEXT NOT NULL CHECK (workspace_id = 'local'),
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    query_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    revision INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    PRIMARY KEY (workspace_id, id)
  );

  CREATE TABLE IF NOT EXISTS agent_tasks (
    workspace_id TEXT NOT NULL CHECK (workspace_id = 'local'),
    id TEXT NOT NULL,
    task_type TEXT NOT NULL,
    input_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'queued',
    definition_version TEXT NOT NULL DEFAULT 'v1',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    cancelled_at TEXT,
    error_json TEXT,
    PRIMARY KEY (workspace_id, id)
  );

  CREATE INDEX IF NOT EXISTS agent_tasks_workspace_updated_idx ON agent_tasks(workspace_id, updated_at, id);

  CREATE TABLE IF NOT EXISTS agent_runs (
    workspace_id TEXT NOT NULL CHECK (workspace_id = 'local'),
    id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    provider TEXT,
    model TEXT,
    started_at TEXT,
    finished_at TEXT,
    error_json TEXT,
    PRIMARY KEY (workspace_id, id)
  );

  CREATE TABLE IF NOT EXISTS agent_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id TEXT NOT NULL CHECK (workspace_id = 'local'),
    task_id TEXT NOT NULL,
    run_id TEXT,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS agent_events_task_seq_idx ON agent_events(workspace_id, task_id, seq);

  CREATE TABLE IF NOT EXISTS agent_outputs (
    workspace_id TEXT NOT NULL CHECK (workspace_id = 'local'),
    id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    run_id TEXT,
    output_type TEXT NOT NULL,
    content_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    PRIMARY KEY (workspace_id, id)
  );

`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some(entry => entry.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

// Forward-compatible columns for local database files.
ensureColumn('ideas', 'revision', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('ideas', 'parent_id', 'TEXT');
ensureColumn('boards', 'pinned', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('boards', 'revision', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('boards', 'deleted_at', 'TEXT');

export function now() { return new Date().toISOString(); }

function json(value, fallback) {
  try { return JSON.stringify(value ?? fallback); } catch { return JSON.stringify(fallback); }
}

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function cryptoRandom() { return randomBytes(24).toString('hex'); }

const upsertIdea = db.prepare(`
  INSERT INTO ideas (
    workspace_id, id, capture_id, capture_key, source_type, source_types_json,
    content_type, relation_type, parent_id, parent_url, parent_snapshot_json, author,
    title, body, body_html, source, url, content_status, created_at,
    captured_at, status, my_thought, tags_json, legacy_practice_json,
    created_at_server, updated_at, revision, deleted_at
  ) VALUES (
    @workspaceId, @id, @captureId, @captureKey, @sourceType, @sourceTypesJson,
    @contentType, @relationType, @parentId, @parentUrl, @parentSnapshotJson, @author,
    @title, @body, @bodyHtml, @source, @url, @contentStatus, @createdAt,
    @capturedAt, @status, @myThought, @tagsJson, @legacyPracticeJson,
    COALESCE((SELECT created_at_server FROM ideas WHERE workspace_id = @workspaceId AND id = @id), @createdAtServer),
    @updatedAt, @revision, @deletedAt
  )
  ON CONFLICT(workspace_id, id) DO UPDATE SET
    capture_id = excluded.capture_id,
    capture_key = excluded.capture_key,
    source_type = excluded.source_type,
    source_types_json = excluded.source_types_json,
    content_type = excluded.content_type,
    relation_type = excluded.relation_type,
    parent_id = excluded.parent_id,
    parent_url = excluded.parent_url,
    parent_snapshot_json = excluded.parent_snapshot_json,
    author = excluded.author,
    title = excluded.title,
    body = excluded.body,
    body_html = excluded.body_html,
    source = excluded.source,
    url = excluded.url,
    content_status = excluded.content_status,
    created_at = excluded.created_at,
    captured_at = excluded.captured_at,
    status = excluded.status,
    my_thought = excluded.my_thought,
    tags_json = excluded.tags_json,
    legacy_practice_json = excluded.legacy_practice_json,
    updated_at = excluded.updated_at,
    revision = excluded.revision,
    deleted_at = excluded.deleted_at
`);

function ideaParams(workspaceId, input, existing = null) {
  const idea = { ...(existing ? publicIdea(existing) : {}), ...(input || {}) };
  const createdAt = String(idea.createdAt || existing?.created_at || now());
  const tags = Array.isArray(idea.tags) ? [...new Set(idea.tags.map(String).map(tag => tag.trim()).filter(Boolean))] : [];
  const sourceTypes = Array.isArray(idea.sourceTypes) && idea.sourceTypes.length
    ? [...new Set(idea.sourceTypes.map(String).filter(Boolean))]
    : [String(idea.sourceType || 'direct')];
  return {
    workspaceId, id: String(idea.id || cryptoRandom()), captureId: idea.captureId || null,
    captureKey: idea.captureKey || null, sourceType: idea.sourceType || 'direct',
    sourceTypesJson: json(sourceTypes, []), contentType: idea.contentType || 'post',
    relationType: idea.relationType || null, parentUrl: idea.parentUrl || null,
    parentId: idea.parentId || null,
    parentSnapshotJson: idea.parentSnapshot ? json(idea.parentSnapshot, null) : null,
    author: idea.author || null, title: idea.title || '', body: String(idea.body || ''),
    bodyHtml: idea.bodyHtml || null, source: idea.source || null, url: idea.url || null,
    contentStatus: idea.contentStatus || null, createdAt, capturedAt: idea.capturedAt || null,
    status: idea.status || 'kept', myThought: idea.myThought || null, tagsJson: json(tags, []),
    legacyPracticeJson: idea.practice ? json(idea.practice, null) : null,
    createdAtServer: now(), updatedAt: now(), revision: existing ? Number(existing.revision || 0) + 1 : 1,
    deletedAt: idea.deletedAt || null
  };
}

export function publicIdea(row) {
  if (!row) return null;
  return {
    id: row.id, captureId: row.capture_id || undefined, captureKey: row.capture_key || undefined,
    sourceType: row.source_type, sourceTypes: parseJson(row.source_types_json, []),
    contentType: row.content_type, relationType: row.relation_type || undefined, parentId: row.parent_id || undefined,
    parentUrl: row.parent_url || undefined, parentSnapshot: parseJson(row.parent_snapshot_json, undefined),
    author: row.author || '', title: row.title || '', body: row.body || '', bodyHtml: row.body_html || undefined,
    source: row.source || '', url: row.url || '', contentStatus: row.content_status || undefined,
    createdAt: row.created_at, capturedAt: row.captured_at || undefined, status: row.status,
    myThought: row.my_thought || '', tags: parseJson(row.tags_json, []),
    updatedAt: row.updated_at, revision: Number(row.revision || 0), deletedAt: row.deleted_at || undefined
  };
}

export function findIdea(workspaceId, id) { return db.prepare('SELECT * FROM ideas WHERE workspace_id = ? AND id = ?').get(workspaceId, id); }

export class RevisionConflictError extends Error {
  constructor(serverIdea) {
    super('Idea revision is stale');
    this.name = 'RevisionConflictError';
    this.code = 'REVISION_CONFLICT';
    this.serverIdea = serverIdea;
  }
}

function comparableIdea(idea) {
  return {
    captureId: idea.captureId || null, captureKey: idea.captureKey || null,
    sourceType: idea.sourceType || 'direct', sourceTypes: idea.sourceTypes || [],
    contentType: idea.contentType || 'post', relationType: idea.relationType || null, parentId: idea.parentId || null,
    parentUrl: idea.parentUrl || null, parentSnapshot: idea.parentSnapshot || null,
    author: idea.author || '', title: idea.title || '', body: idea.body || '', bodyHtml: idea.bodyHtml || null,
    source: idea.source || '', url: idea.url || '', contentStatus: idea.contentStatus || null,
    createdAt: idea.createdAt || null, capturedAt: idea.capturedAt || null, status: idea.status || 'kept',
    myThought: idea.myThought || '', tags: idea.tags || [], deletedAt: idea.deletedAt || null
  };
}

export function saveIdea(workspaceId, input) {
  const existing = input?.id ? findIdea(workspaceId, String(input.id)) : null;
  if (existing && input?.revision !== undefined && Number(input.revision) !== Number(existing.revision)) {
    throw new RevisionConflictError(publicIdea(existing));
  }
  if (existing) {
    const current = publicIdea(existing);
    const candidate = { ...current, ...input };
    if (JSON.stringify(comparableIdea(current)) === JSON.stringify(comparableIdea(candidate))) return { idea: current };
  }
  const params = ideaParams(workspaceId, input, existing);
  const persist = db.transaction(() => {
    upsertIdea.run(params);
    if (params.parentId && params.parentId !== params.id && findIdea(workspaceId, params.parentId)) {
      saveRelation(workspaceId, {
        fromIdeaId: params.id, toIdeaId: params.parentId,
        relationType: params.relationType || 'extends'
      });
    }
    return { row: findIdea(workspaceId, params.id) };
  });
  const result = persist();
  return { idea: publicIdea(result.row) };
}

export function saveIdeasBatch(workspaceId, items) {
  const accepted = [];
  const conflicts = [];
  for (const item of items) {
    try { accepted.push(saveIdea(workspaceId, item)); }
    catch (error) {
      if (error.code !== 'REVISION_CONFLICT') throw error;
      conflicts.push({ id: item.id, idea: error.serverIdea });
    }
  }
  return {
    accepted: accepted.map(result => result.idea),
    conflicts
  };
}

export function deleteIdea(workspaceId, id, revision) {
  const existing = findIdea(workspaceId, id);
  if (!existing) return null;
  if (revision !== undefined && Number(revision) !== Number(existing.revision)) throw new RevisionConflictError(publicIdea(existing));
  const deletedAt = now();
  const nextRevision = Number(existing.revision || 0) + 1;
  db.prepare('UPDATE ideas SET deleted_at = ?, updated_at = ?, revision = ? WHERE workspace_id = ? AND id = ?')
    .run(deletedAt, deletedAt, nextRevision, workspaceId, id);
  return { idea: publicIdea(findIdea(workspaceId, id)) };
}

function relationRow(workspaceId, id) { return db.prepare('SELECT * FROM idea_relations WHERE workspace_id = ? AND id = ?').get(workspaceId, id); }

function publicRelation(row) {
  if (!row) return null;
  return {
    id: row.id, fromIdeaId: row.from_idea_id, toIdeaId: row.to_idea_id,
    relationType: row.relation_type, metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at, updatedAt: row.updated_at,
    revision: Number(row.revision || 0), deletedAt: row.deleted_at || undefined
  };
}

const upsertRelation = db.prepare(`
  INSERT INTO idea_relations (
    workspace_id, id, from_idea_id, to_idea_id, relation_type, metadata_json,
    created_at, updated_at, revision, deleted_at
  ) VALUES (
    @workspaceId, @id, @fromIdeaId, @toIdeaId, @relationType, @metadataJson,
    @createdAt, @updatedAt, @revision, @deletedAt
  )
  ON CONFLICT(workspace_id, id) DO UPDATE SET
    from_idea_id = excluded.from_idea_id,
    to_idea_id = excluded.to_idea_id,
    relation_type = excluded.relation_type,
    metadata_json = excluded.metadata_json,
    updated_at = excluded.updated_at,
    revision = excluded.revision,
    deleted_at = excluded.deleted_at
`);

export function saveRelation(workspaceId, input) {
  if (!input?.fromIdeaId || !input?.toIdeaId || !input?.relationType) throw Object.assign(new Error('fromIdeaId, toIdeaId and relationType are required'), { status: 400 });
  if (String(input.fromIdeaId) === String(input.toIdeaId)) throw Object.assign(new Error('An Idea cannot relate to itself'), { status: 400 });
  if (!findIdea(workspaceId, String(input.fromIdeaId)) || !findIdea(workspaceId, String(input.toIdeaId))) throw Object.assign(new Error('Both related Ideas must exist'), { status: 400 });
  const byId = input.id ? relationRow(workspaceId, String(input.id)) : null;
  const byTriple = db.prepare(`SELECT * FROM idea_relations WHERE workspace_id = ? AND from_idea_id = ? AND to_idea_id = ? AND relation_type = ?`)
    .get(workspaceId, String(input.fromIdeaId), String(input.toIdeaId), String(input.relationType));
  const existing = byId || byTriple;
  if (existing && input.revision !== undefined && Number(input.revision) !== Number(existing.revision)) throw new RevisionConflictError(publicRelation(existing));
  if (existing) {
    const current = publicRelation(existing);
    const metadata = input.metadata === undefined ? current.metadata : input.metadata;
    if (current.fromIdeaId === String(input.fromIdeaId) && current.toIdeaId === String(input.toIdeaId) &&
      current.relationType === String(input.relationType) && JSON.stringify(current.metadata) === JSON.stringify(metadata) && !input.deletedAt) {
      return { relation: current };
    }
  }
  const createdAt = existing?.created_at || now();
  const params = {
    workspaceId, id: existing?.id || String(input.id || cryptoRandom()), fromIdeaId: String(input.fromIdeaId),
    toIdeaId: String(input.toIdeaId), relationType: String(input.relationType), metadataJson: json(input.metadata, {}),
    createdAt, updatedAt: now(), revision: Number(existing?.revision || 0) + 1, deletedAt: input.deletedAt || null
  };
  upsertRelation.run(params);
  return { relation: publicRelation(relationRow(workspaceId, params.id)) };
}

export function listRelations(workspaceId, ideaId, includeDeleted = false) {
  const whereDeleted = includeDeleted ? '' : 'AND deleted_at IS NULL';
  const rows = ideaId
    ? db.prepare(`SELECT * FROM idea_relations WHERE workspace_id = ? AND (from_idea_id = ? OR to_idea_id = ?) ${whereDeleted} ORDER BY created_at ASC`).all(workspaceId, ideaId, ideaId)
    : db.prepare(`SELECT * FROM idea_relations WHERE workspace_id = ? ${whereDeleted} ORDER BY created_at ASC`).all(workspaceId);
  return rows.map(publicRelation);
}

export function deleteRelation(workspaceId, id, revision) {
  const existing = relationRow(workspaceId, id);
  if (!existing) return null;
  if (revision !== undefined && Number(revision) !== Number(existing.revision)) throw new RevisionConflictError(publicRelation(existing));
  const deletedAt = now();
  const nextRevision = Number(existing.revision || 0) + 1;
  db.prepare('UPDATE idea_relations SET deleted_at = ?, updated_at = ?, revision = ? WHERE workspace_id = ? AND id = ?')
    .run(deletedAt, deletedAt, nextRevision, workspaceId, id);
  return { relation: publicRelation(relationRow(workspaceId, id)) };
}

export function listIdeas(workspaceId, { includeDeleted = false, limit = 5000 } = {}) {
  const rows = db.prepare(`SELECT * FROM ideas WHERE workspace_id = ? ${includeDeleted ? '' : 'AND deleted_at IS NULL'} ORDER BY created_at DESC LIMIT ?`).all(workspaceId, Math.min(Math.max(Number(limit) || 5000, 1), 10000));
  return rows.map(publicIdea);
}
