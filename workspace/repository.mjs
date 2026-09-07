import { randomUUID } from 'node:crypto';
import { db, now, RevisionConflictError } from '../db.mjs';

function parse(value, fallback = {}) { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
function json(value, fallback = {}) { try { return JSON.stringify(value ?? fallback); } catch { return JSON.stringify(fallback); } }

function boardRow(workspaceId, id) { return db.prepare('SELECT * FROM boards WHERE workspace_id = ? AND id = ?').get(workspaceId, id); }
function publicBoard(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, query: parse(row.query_json), pinned: Boolean(row.pinned), createdAt: row.created_at, updatedAt: row.updated_at, revision: Number(row.revision || 0), deletedAt: row.deleted_at || undefined };
}

const upsertBoard = db.prepare(`
  INSERT INTO boards (workspace_id, id, name, query_json, created_at, updated_at, pinned, revision, deleted_at)
  VALUES (@workspaceId, @id, @name, @queryJson, @createdAt, @updatedAt, @pinned, @revision, @deletedAt)
  ON CONFLICT(workspace_id, id) DO UPDATE SET
    name = excluded.name, query_json = excluded.query_json, updated_at = excluded.updated_at,
    pinned = excluded.pinned, revision = excluded.revision, deleted_at = excluded.deleted_at
`);

export function saveBoard(workspaceId, input) {
  const name = String(input?.name || '').trim();
  if (!name) throw Object.assign(new Error('Board name is required'), { status: 400 });
  const existing = input.id ? boardRow(workspaceId, String(input.id)) : null;
  if (existing && input.revision !== undefined && Number(input.revision) !== Number(existing.revision)) throw new RevisionConflictError(publicBoard(existing));
  const current = existing ? publicBoard(existing) : null;
  const candidate = { ...current, ...input };
  if (existing && JSON.stringify({ name: current.name, query: current.query, pinned: current.pinned, deletedAt: current.deletedAt || null }) === JSON.stringify({ name, query: candidate.query || {}, pinned: Boolean(candidate.pinned), deletedAt: candidate.deletedAt || null })) return { board: current };
  const createdAt = existing?.created_at || now();
  const params = { workspaceId, id: existing?.id || String(input.id || randomUUID()), name, queryJson: json(input.query, {}), createdAt, updatedAt: now(), pinned: input.pinned ? 1 : 0, revision: Number(existing?.revision || 0) + 1, deletedAt: input.deletedAt || null };
  const persist = db.transaction(() => {
    upsertBoard.run(params);
    return db.prepare('SELECT * FROM boards WHERE workspace_id = ? AND id = ?').get(workspaceId, params.id);
  });
  const row = persist();
  return { board: publicBoard(row) };
}

export function listBoards(workspaceId, includeDeleted = false) {
  const where = includeDeleted ? '' : 'AND deleted_at IS NULL';
  return db.prepare(`SELECT * FROM boards WHERE workspace_id = ? ${where} ORDER BY pinned DESC, updated_at DESC`).all(workspaceId).map(publicBoard);
}

export function deleteBoard(workspaceId, id, revision) {
  const existing = boardRow(workspaceId, id);
  if (!existing) return null;
  if (revision !== undefined && Number(revision) !== Number(existing.revision)) throw new RevisionConflictError(publicBoard(existing));
  const deletedAt = now();
  db.prepare('UPDATE boards SET deleted_at = ?, updated_at = ?, revision = ? WHERE workspace_id = ? AND id = ?').run(deletedAt, deletedAt, Number(existing.revision || 0) + 1, workspaceId, id);
  return { board: publicBoard(boardRow(workspaceId, id)) };
}

export function listTags(workspaceId) {
  const counts = new Map();
  for (const row of db.prepare('SELECT tags_json FROM ideas WHERE workspace_id = ? AND deleted_at IS NULL').all(workspaceId)) {
    for (const tag of parse(row.tags_json, [])) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  for (const row of db.prepare('SELECT name FROM tags WHERE workspace_id = ? ORDER BY name').all(workspaceId)) if (!counts.has(row.name)) counts.set(row.name, 0);
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
}

export function createTag(workspaceId, name) {
  const clean = String(name || '').trim();
  if (!clean || clean.length > 64) throw Object.assign(new Error('Tag name must be 1–64 characters'), { status: 400 });
  db.prepare('INSERT OR IGNORE INTO tags (workspace_id, name, created_at) VALUES (?, ?, ?)').run(workspaceId, clean, now());
  return { name: clean };
}

export function deleteTag(workspaceId, name) { db.prepare('DELETE FROM tags WHERE workspace_id = ? AND name = ?').run(workspaceId, name); }
