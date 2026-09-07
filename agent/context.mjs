import { listIdeas } from '../db.mjs';

function terms(value) {
  return [...new Set(String(value || '').toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) || [])];
}

function scoreIdea(idea, queryTerms) {
  const text = [idea.title, idea.body, idea.myThought, idea.author, ...(idea.tags || [])].join(' ').toLowerCase();
  return queryTerms.reduce((score, term) => score + (text.includes(term) ? (idea.title?.toLowerCase().includes(term) ? 4 : 1) : 0), 0);
}

export function buildContext(workspaceId, task, { limit = 12 } = {}) {
  const prompt = task.input?.prompt || '';
  const queryTerms = terms(prompt);
  const candidates = listIdeas(workspaceId).map(idea => ({ idea, score: scoreIdea(idea, queryTerms) }))
    .filter(candidate => !queryTerms.length || candidate.score > 0)
    .sort((left, right) => right.score - left.score || new Date(right.idea.createdAt) - new Date(left.idea.createdAt))
    .slice(0, Math.min(Math.max(Number(limit) || 12, 1), 50));
  return {
    query: prompt,
    candidates: candidates.map(({ idea, score }) => ({ idea, score })),
    citations: candidates.map(({ idea }) => ({ ideaId: idea.id, title: idea.title || idea.body.slice(0, 80), url: idea.url || null }))
  };
}
