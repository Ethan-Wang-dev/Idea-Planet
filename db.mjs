import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import Database from 'better-sqlite3';

const defaultPath = process.env.IDEA_PLANET_DB || new URL('./.data/idea-planet.sqlite', import.meta.url).pathname;
if (defaultPath !== ':memory:') mkdirSync(dirname(defaultPath), { recursive: true });

export const db = new Database(defaultPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    password_hash TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT
  );

  CREATE TABLE IF NOT EXISTS ideas (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    PRIMARY KEY (user_id, id)
  );

  CREATE INDEX IF NOT EXISTS ideas_user_updated_idx ON ideas(user_id, updated_at, id);
  CREATE INDEX IF NOT EXISTS ideas_user_url_idx ON ideas(user_id, url);

  CREATE TABLE IF NOT EXISTS idea_relations (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    from_idea_id TEXT NOT NULL,
    to_idea_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    PRIMARY KEY (user_id, id),
    UNIQUE (user_id, from_idea_id, to_idea_id, relation_type)
  );

  CREATE INDEX IF NOT EXISTS idea_relations_user_from_idx ON idea_relations(user_id, from_idea_id);
  CREATE INDEX IF NOT EXISTS idea_relations_user_to_idx ON idea_relations(user_id, to_idea_id);

  CREATE TABLE IF NOT EXISTS tags (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, name)
  );

  CREATE TABLE IF NOT EXISTS boards (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    query_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    revision INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    PRIMARY KEY (user_id, id)
  );

  CREATE TABLE IF NOT EXISTS agent_tasks (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    task_type TEXT NOT NULL,
    input_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'queued',
    definition_version TEXT NOT NULL DEFAULT 'v1',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    cancelled_at TEXT,
    error_json TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    locked_by TEXT,
    locked_at TEXT,
    heartbeat_at TEXT,
    next_attempt_at TEXT,
    PRIMARY KEY (user_id, id)
  );

  CREATE INDEX IF NOT EXISTS agent_tasks_user_updated_idx ON agent_tasks(user_id, updated_at, id);

  CREATE TABLE IF NOT EXISTS agent_runs (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    provider TEXT,
    model TEXT,
    started_at TEXT,
    finished_at TEXT,
    error_json TEXT,
    PRIMARY KEY (user_id, id)
  );

  CREATE TABLE IF NOT EXISTS agent_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL,
    run_id TEXT,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS agent_events_task_seq_idx ON agent_events(user_id, task_id, seq);

  CREATE TABLE IF NOT EXISTS agent_outputs (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    run_id TEXT,
    output_type TEXT NOT NULL,
    content_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
  );

  CREATE TABLE IF NOT EXISTS change_log (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    changed_at TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT
  );

  CREATE INDEX IF NOT EXISTS change_log_user_seq_idx ON change_log(user_id, seq);
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some(entry => entry.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

// Lightweight forward migrations for the local development database. Production
// migrations will move to numbered migration files before deployment.
ensureColumn('users', 'password_hash', 'TEXT');
ensureColumn('ideas', 'revision', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('ideas', 'parent_id', 'TEXT');
ensureColumn('boards', 'pinned', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('boards', 'revision', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('boards', 'deleted_at', 'TEXT');
ensureColumn('agent_tasks', 'attempt_count', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('agent_tasks', 'locked_by', 'TEXT');
ensureColumn('agent_tasks', 'locked_at', 'TEXT');
ensureColumn('agent_tasks', 'heartbeat_at', 'TEXT');
ensureColumn('agent_tasks', 'next_attempt_at', 'TEXT');
ensureColumn('change_log', 'revision', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('change_log', 'deleted_at', 'TEXT');

export function now() { return new Date().toISOString(); }

function json(value, fallback) {
  try { return JSON.stringify(value ?? fallback); } catch { return JSON.stringify(fallback); }
}

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createDevSession() {
  const createdAt = now();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get('dev-local') || (() => {
    db.prepare('INSERT INTO users (id, email, display_name, created_at) VALUES (?, ?, ?, ?)')
      .run('dev-local', 'local@idea-planet.test', 'Local Planet', createdAt);
    return db.prepare('SELECT * FROM users WHERE id = ?').get('dev-local');
  })();
  const token = `ip_dev_${cryptoRandom()}`;
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)')
    .run(tokenHash(token), user.id, createdAt);
  return { token, user: publicUser(user) };
}

function issueSession(userId) {
  const token = `ip_${cryptoRandom()}`;
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)' )
    .run(tokenHash(token), userId, now(), new Date(Date.now() + 30 * 86400000).toISOString());
  return token;
}

export function registerUser({ email, password, displayName }) {
  const clean = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw Object.assign(new Error('A valid email is required'), { status: 400 });
  if (String(password || '').length < 8) throw Object.assign(new Error('Password must be at least 8 characters'), { status: 400 });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(clean)) throw Object.assign(new Error('Email is already registered'), { status: 409 });
  const id = `user_${cryptoRandom()}`; const createdAt = now();
  const salt = randomBytes(16).toString('hex');
  const hash = `${salt}:${scryptSync(String(password), salt, 64).toString('hex')}`;
  db.prepare('INSERT INTO users (id,email,display_name,created_at,password_hash) VALUES (?,?,?,?,?)').run(id, clean, String(displayName || clean.split('@')[0]).slice(0,80), createdAt, hash);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return { token: issueSession(id), user: publicUser(user) };
}

export function loginUser({ email, password }) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
  const [salt, expected] = String(user?.password_hash || ':').split(':');
  const actual = salt ? scryptSync(String(password || ''), salt, 64).toString('hex') : '';
  if (!user || !expected || actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) throw Object.assign(new Error('Invalid email or password'), { status: 401 });
  return { token: issueSession(user.id), user: publicUser(user) };
}

export function revokeSession(token) { if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token)); }
export function updateUser(userId, { displayName, password }) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  let hash = user.password_hash;
  if (password !== undefined) {
    if (String(password).length < 8) throw Object.assign(new Error('Password must be at least 8 characters'), { status: 400 });
    const salt = randomBytes(16).toString('hex'); hash = `${salt}:${scryptSync(String(password), salt, 64).toString('hex')}`;
  }
  db.prepare('UPDATE users SET display_name = ?, password_hash = ? WHERE id = ?').run(displayName === undefined ? user.display_name : String(displayName).trim().slice(0,80), hash, userId);
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
}
export function deleteUser(userId) { db.prepare('DELETE FROM users WHERE id = ?').run(userId); }

function cryptoRandom() {
  return randomBytes(24).toString('hex');
}

export function authenticate(token) {
  if (!token) return null;
  const row = db.prepare(`SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND (sessions.expires_at IS NULL OR sessions.expires_at > ?)`)
    .get(tokenHash(token), now());
  return row ? publicUser(row) : null;
}

export function publicUser(row) {
  return { id: row.id, email: row.email, displayName: row.display_name, createdAt: row.created_at };
}

const upsertIdea = db.prepare(`
  INSERT INTO ideas (
    user_id, id, capture_id, capture_key, source_type, source_types_json,
    content_type, relation_type, parent_id, parent_url, parent_snapshot_json, author,
    title, body, body_html, source, url, content_status, created_at,
    captured_at, status, my_thought, tags_json, legacy_practice_json,
    created_at_server, updated_at, revision, deleted_at
  ) VALUES (
    @userId, @id, @captureId, @captureKey, @sourceType, @sourceTypesJson,
    @contentType, @relationType, @parentId, @parentUrl, @parentSnapshotJson, @author,
    @title, @body, @bodyHtml, @source, @url, @contentStatus, @createdAt,
    @capturedAt, @status, @myThought, @tagsJson, @legacyPracticeJson,
    COALESCE((SELECT created_at_server FROM ideas WHERE user_id = @userId AND id = @id), @createdAtServer),
    @updatedAt, @revision, @deletedAt
  )
  ON CONFLICT(user_id, id) DO UPDATE SET
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

function ideaParams(userId, input, existing = null) {
  const idea = { ...(existing ? publicIdea(existing) : {}), ...(input || {}) };
  const createdAt = String(idea.createdAt || existing?.created_at || now());
  const tags = Array.isArray(idea.tags) ? [...new Set(idea.tags.map(String).map(tag => tag.trim()).filter(Boolean))] : [];
  const sourceTypes = Array.isArray(idea.sourceTypes) && idea.sourceTypes.length
    ? [...new Set(idea.sourceTypes.map(String).filter(Boolean))]
    : [String(idea.sourceType || 'direct')];
  return {
    userId, id: String(idea.id || cryptoRandom()), captureId: idea.captureId || null,
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

export function findIdea(userId, id) { return db.prepare('SELECT * FROM ideas WHERE user_id = ? AND id = ?').get(userId, id); }

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

export function saveIdea(userId, input) {
  const existing = input?.id ? findIdea(userId, String(input.id)) : null;
  if (existing && input?.revision !== undefined && Number(input.revision) !== Number(existing.revision)) {
    throw new RevisionConflictError(publicIdea(existing));
  }
  if (existing) {
    const current = publicIdea(existing);
    const candidate = { ...current, ...input };
    if (JSON.stringify(comparableIdea(current)) === JSON.stringify(comparableIdea(candidate))) return { idea: current, seq: 0 };
  }
  const params = ideaParams(userId, input, existing);
  const persist = db.transaction(() => {
    upsertIdea.run(params);
    if (params.parentId && params.parentId !== params.id && findIdea(userId, params.parentId)) {
      saveRelation(userId, {
        fromIdeaId: params.id, toIdeaId: params.parentId,
        relationType: params.relationType || 'extends'
      });
    }
    const changedAt = now();
    const change = db.prepare('INSERT INTO change_log (user_id, entity_type, entity_id, changed_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, 'idea', params.id, changedAt, params.revision, params.deletedAt);
    return { row: findIdea(userId, params.id), seq: Number(change.lastInsertRowid) };
  });
  const result = persist();
  return { idea: publicIdea(result.row), seq: result.seq };
}

export function syncIdeas(userId, items) {
  const accepted = [];
  const conflicts = [];
  for (const item of items) {
    try { accepted.push(saveIdea(userId, item)); }
    catch (error) {
      if (error.code !== 'REVISION_CONFLICT') throw error;
      conflicts.push({ id: item.id, idea: error.serverIdea });
    }
  }
  return {
    accepted: accepted.map(result => result.idea),
    conflicts,
    cursor: accepted.reduce((cursor, result) => Math.max(cursor, result.seq), 0)
  };
}

export function deleteIdea(userId, id, revision) {
  const existing = findIdea(userId, id);
  if (!existing) return null;
  if (revision !== undefined && Number(revision) !== Number(existing.revision)) throw new RevisionConflictError(publicIdea(existing));
  const deletedAt = now();
  const nextRevision = Number(existing.revision || 0) + 1;
  db.prepare('UPDATE ideas SET deleted_at = ?, updated_at = ?, revision = ? WHERE user_id = ? AND id = ?')
    .run(deletedAt, deletedAt, nextRevision, userId, id);
  const change = db.prepare('INSERT INTO change_log (user_id, entity_type, entity_id, changed_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, 'idea', id, deletedAt, nextRevision, deletedAt);
  return { idea: publicIdea(findIdea(userId, id)), seq: Number(change.lastInsertRowid) };
}

function relationRow(userId, id) { return db.prepare('SELECT * FROM idea_relations WHERE user_id = ? AND id = ?').get(userId, id); }

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
    user_id, id, from_idea_id, to_idea_id, relation_type, metadata_json,
    created_at, updated_at, revision, deleted_at
  ) VALUES (
    @userId, @id, @fromIdeaId, @toIdeaId, @relationType, @metadataJson,
    @createdAt, @updatedAt, @revision, @deletedAt
  )
  ON CONFLICT(user_id, id) DO UPDATE SET
    from_idea_id = excluded.from_idea_id,
    to_idea_id = excluded.to_idea_id,
    relation_type = excluded.relation_type,
    metadata_json = excluded.metadata_json,
    updated_at = excluded.updated_at,
    revision = excluded.revision,
    deleted_at = excluded.deleted_at
`);

export function saveRelation(userId, input) {
  if (!input?.fromIdeaId || !input?.toIdeaId || !input?.relationType) throw Object.assign(new Error('fromIdeaId, toIdeaId and relationType are required'), { status: 400 });
  if (String(input.fromIdeaId) === String(input.toIdeaId)) throw Object.assign(new Error('An Idea cannot relate to itself'), { status: 400 });
  if (!findIdea(userId, String(input.fromIdeaId)) || !findIdea(userId, String(input.toIdeaId))) throw Object.assign(new Error('Both related Ideas must exist'), { status: 400 });
  const byId = input.id ? relationRow(userId, String(input.id)) : null;
  const byTriple = db.prepare(`SELECT * FROM idea_relations WHERE user_id = ? AND from_idea_id = ? AND to_idea_id = ? AND relation_type = ?`)
    .get(userId, String(input.fromIdeaId), String(input.toIdeaId), String(input.relationType));
  const existing = byId || byTriple;
  if (existing && input.revision !== undefined && Number(input.revision) !== Number(existing.revision)) throw new RevisionConflictError(publicRelation(existing));
  if (existing) {
    const current = publicRelation(existing);
    const metadata = input.metadata === undefined ? current.metadata : input.metadata;
    if (current.fromIdeaId === String(input.fromIdeaId) && current.toIdeaId === String(input.toIdeaId) &&
      current.relationType === String(input.relationType) && JSON.stringify(current.metadata) === JSON.stringify(metadata) && !input.deletedAt) {
      return { relation: current, seq: 0 };
    }
  }
  const createdAt = existing?.created_at || now();
  const params = {
    userId, id: existing?.id || String(input.id || cryptoRandom()), fromIdeaId: String(input.fromIdeaId),
    toIdeaId: String(input.toIdeaId), relationType: String(input.relationType), metadataJson: json(input.metadata, {}),
    createdAt, updatedAt: now(), revision: Number(existing?.revision || 0) + 1, deletedAt: input.deletedAt || null
  };
  upsertRelation.run(params);
  const changedAt = now();
  const change = db.prepare('INSERT INTO change_log (user_id, entity_type, entity_id, changed_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, 'relation', params.id, changedAt, params.revision, params.deletedAt);
  return { relation: publicRelation(relationRow(userId, params.id)), seq: Number(change.lastInsertRowid) };
}

export function listRelations(userId, ideaId, includeDeleted = false) {
  const whereDeleted = includeDeleted ? '' : 'AND deleted_at IS NULL';
  const rows = ideaId
    ? db.prepare(`SELECT * FROM idea_relations WHERE user_id = ? AND (from_idea_id = ? OR to_idea_id = ?) ${whereDeleted} ORDER BY created_at ASC`).all(userId, ideaId, ideaId)
    : db.prepare(`SELECT * FROM idea_relations WHERE user_id = ? ${whereDeleted} ORDER BY created_at ASC`).all(userId);
  return rows.map(publicRelation);
}

export function deleteRelation(userId, id, revision) {
  const existing = relationRow(userId, id);
  if (!existing) return null;
  if (revision !== undefined && Number(revision) !== Number(existing.revision)) throw new RevisionConflictError(publicRelation(existing));
  const deletedAt = now();
  const nextRevision = Number(existing.revision || 0) + 1;
  db.prepare('UPDATE idea_relations SET deleted_at = ?, updated_at = ?, revision = ? WHERE user_id = ? AND id = ?')
    .run(deletedAt, deletedAt, nextRevision, userId, id);
  const change = db.prepare('INSERT INTO change_log (user_id, entity_type, entity_id, changed_at, revision, deleted_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, 'relation', id, deletedAt, nextRevision, deletedAt);
  return { relation: publicRelation(relationRow(userId, id)), seq: Number(change.lastInsertRowid) };
}

export function listIdeas(userId, { includeDeleted = false, limit = 5000 } = {}) {
  const rows = db.prepare(`SELECT * FROM ideas WHERE user_id = ? ${includeDeleted ? '' : 'AND deleted_at IS NULL'} ORDER BY created_at DESC LIMIT ?`).all(userId, Math.min(Math.max(Number(limit) || 5000, 1), 10000));
  return rows.map(publicIdea);
}

export function pullChanges(userId, after = 0, limit = 5000) {
  const rows = db.prepare(`SELECT seq, entity_type, entity_id, changed_at, revision, deleted_at FROM change_log
    WHERE user_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?`).all(userId, Number(after) || 0, Math.min(Math.max(Number(limit) || 5000, 1), 10000));
  const changes = rows.map(row => ({
    seq: row.seq, entityType: row.entity_type, entityId: row.entity_id,
    changedAt: row.changed_at, revision: row.revision, deletedAt: row.deleted_at || undefined,
    idea: row.entity_type === 'idea' && !row.deleted_at ? publicIdea(findIdea(userId, row.entity_id)) : undefined,
    relation: row.entity_type === 'relation' && !row.deleted_at ? publicRelation(relationRow(userId, row.entity_id)) : undefined
  }));
  const ideas = changes.map(change => change.idea).filter(Boolean);
  const relations = changes.map(change => change.relation).filter(Boolean);
  return { cursor: rows.length ? rows.at(-1).seq : Number(after) || 0, changes, ideas, relations };
}
