const STORAGE_KEY = 'idea-planet-mvp-v1';
const API_TOKEN_KEY = 'idea-planet-api-token';
const API_CURSOR_KEY = 'idea-planet-api-cursor';
const apiState = { token: localStorage.getItem(API_TOKEN_KEY) || '', cursor: Number(localStorage.getItem(API_CURSOR_KEY) || 0), ready: false, online: false, authenticated: false, booting: false, syncing: false, pulling: false, dirty: false, config: null };

const seedIdeas = [
  {
    id: 'seed-prompt', sourceType: 'bookmark', author: 'Prompt Notes',
    title: '好的提示词不是命令，而是一份清晰的工作说明。',
    body: '先说明目标，再给出上下文、限制条件和验收标准。让模型知道什么叫做“完成”。',
    source: '一段提示词结构分享 · 保存了完整内容', url: 'https://x.com/example/status/1001',
    createdAt: '2026-09-04T18:20:00.000Z', status: 'inbox', myThought: '',
    practice: { goal: '', due: '', result: '', done: false }
  },
  {
    id: 'seed-product', sourceType: 'direct', author: 'Ethan Juk',
    title: '不要先建立知识库，先观察用户是否愿意回来处理它。',
    body: '真正需要验证的是：用户是否愿意重新遇见一个曾经打动过自己的内容，并决定它是否值得留下。',
    source: 'Idea Planet 产品思考', url: '',
    createdAt: '2026-09-04T10:14:00.000Z', status: 'inbox', myThought: '',
    practice: { goal: '', due: '', result: '', done: false }
  },
  {
    id: 'seed-steps', sourceType: 'bookmark', author: 'Build in public',
    title: '把想法变成动作，最小的下一步必须小到今天就能做。',
    body: '一个研究方向如果没有下一步动作，就很容易重新变成收藏夹里的情绪价值。',
    source: '关于执行与反馈的长帖', url: 'https://x.com/example/status/1002',
    createdAt: '2026-09-02T11:10:00.000Z', status: 'kept', myThought: '我要把每个值得留下的想法，都问一次：今天能验证什么？',
    practice: { goal: '为 Idea Planet 写出第一版收集表单', due: '2026-09-06', result: '', done: false }
  },
  {
    id: 'seed-like', sourceType: 'like', author: 'A quiet observer',
    title: '有些点赞只是“我看见你了”。',
    body: '互动和认同都是真实的行为，但它们不一定需要进入长期的思想空间。',
    source: '点赞候选 · 等待你的判断', url: 'https://x.com/example/status/1003',
    createdAt: '2026-09-01T08:40:00.000Z', status: 'inbox', myThought: '',
    practice: { goal: '', due: '', result: '', done: false }
  }
];

const state = { view: 'today', filter: 'all', tag: '', query: '', pinnedTags: loadPinnedTags(), ideas: loadIdeas() };
const agentState = { prompt: '', status: 'idle', task: null, output: null, error: '' };
const expandedIdeas = new Set();
let activeEditor = null;
const viewRoot = document.querySelector('#viewRoot');
let landingData = null;

function renderLanding(data = landingData) {
  if (!data) return;
  const hero = data.hero || {};
  const brand = data.brand || {};
  const setText = (selector, value) => { const node = document.querySelector(selector); if (node && value !== undefined) node.textContent = value; };
  setText('#landingEyebrow', hero.eyebrow);
  setText('#landingTitle', hero.title);
  setText('#landingSubtitle', hero.subtitle);
  setText('#landingDescription', hero.description);
  setText('.footer-brand p', brand.tagline);
  setText('#communityTitle', data.community?.title);
  setText('#communityDescription', data.community?.description);
  const gallery = document.querySelector('#landingGallery');
  if (gallery) gallery.innerHTML = (data.gallery || []).map(item => `<article class="gallery-card"><div class="gallery-visual"><img src="${esc(item.image)}" alt="${esc(item.title)}" loading="lazy" /></div><div class="gallery-copy"><div><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p></div><span class="gallery-type">${esc(item.type)}</span></div></article>`).join('');
  const stats = document.querySelector('#landingStats');
  if (stats) stats.innerHTML = (data.stats || []).map(item => `<article class="stat-card"><strong>${esc(item.value)}</strong><h3>${esc(item.label)}</h3><p>${esc(item.description)}</p></article>`).join('');
}

function showLanding() {
  const landing = document.querySelector('#landingRoot');
  const workspace = document.querySelector('#workspaceShell');
  if (landing) landing.hidden = false;
  if (workspace) workspace.hidden = true;
  document.body.classList.add('landing-mode');
  renderLanding();
  const cookie = document.querySelector('#cookieBanner');
  if (cookie && localStorage.getItem('idea-planet-cookie-choice') !== 'saved') cookie.hidden = false;
}

function showWorkspace() {
  const landing = document.querySelector('#landingRoot');
  const workspace = document.querySelector('#workspaceShell');
  if (landing) landing.hidden = true;
  if (workspace) workspace.hidden = false;
  document.querySelector('#menuPanel')?.setAttribute('hidden', '');
  document.querySelector('#cookieBanner')?.setAttribute('hidden', '');
  document.body.classList.remove('landing-mode');
}

function loadIdeas() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(stored)) {
      const cleaned = dedupeIdeas(stored);
      if (cleaned.length !== stored.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
      return cleaned;
    }
  } catch { /* use seeds */ }
  return structuredClone(seedIdeas);
}

function saveIdeas() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.ideas));
  if (apiState.ready && apiState.online) queueApiSync();
}

function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (apiState.token) headers.set('Authorization', `Bearer ${apiState.token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(`/api/v1${path}`, { ...options, headers }).then(async response => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `API request failed (${response.status})`);
    return payload;
  });
}

async function bootstrapApi() {
  if (apiState.booting) return;
  apiState.booting = true;
  try {
    apiState.config = await apiRequest('/public/config');
    if (apiState.token) {
      try { await apiRequest('/me'); } catch { apiState.token = ''; apiState.authenticated = false; localStorage.removeItem(API_TOKEN_KEY); }
    }
    if (!apiState.token && apiState.config?.devSessionEnabled) {
      const session = await apiRequest('/auth/dev-session', { method: 'POST' });
      apiState.token = session.token;
      localStorage.setItem(API_TOKEN_KEY, apiState.token);
    }
    if (!apiState.token) {
      // The open-source app is local-first. The browser workspace and its
      // localStorage data are usable without an account or a remote API.
      apiState.ready = true;
      apiState.online = false;
      apiState.authenticated = false;
      showWorkspace();
      render();
      return;
    }
    apiState.authenticated = true;
    showWorkspace();
    const remote = await apiRequest('/ideas');
    const localStored = readStoredIdeas();
    if (remote.ideas?.length || localStored) {
      // During the first migration, merge both sides so a local-only edit is not
      // silently discarded. A later sync protocol can replace this with revisions.
      state.ideas = dedupeIdeas([...(remote.ideas || []), ...(localStored || [])]);
      saveLocalIdeas();
      if (state.ideas.length) await pushIdeas(state.ideas);
    }
    apiState.ready = true;
    apiState.online = true;
    await pullApiChanges();
    render();
  } catch (error) {
    apiState.online = false;
    if (!apiState.token) { apiState.authenticated = false; showWorkspace(); render(); }
    else { apiState.authenticated = true; showWorkspace(); render(); }
    console.info('Idea Planet API unavailable; using local cache.', error.message);
  } finally { apiState.booting = false; }
}

function readStoredIdeas() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) ? stored : null;
  } catch { return null; }
}

function saveLocalIdeas() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.ideas)); }

async function pushIdeas(ideas) {
  if (!apiState.token || !ideas.length) return;
  const result = await apiRequest('/sync/push', { method: 'POST', body: JSON.stringify({ ideas }) });
  if (Number(result.cursor) > apiState.cursor) {
    apiState.cursor = Number(result.cursor);
    localStorage.setItem(API_CURSOR_KEY, String(apiState.cursor));
  }
  for (const accepted of result.accepted || []) {
    const local = state.ideas.find(idea => idea.id === accepted.id);
    if (local) Object.assign(local, accepted);
  }
  saveLocalIdeas();
  if (result.conflicts?.length) {
    apiState.online = false;
    console.warn('Idea Planet sync conflicts require review.', result.conflicts);
    if (apiState.ready) toast(`${result.conflicts.length} 条 Idea 有同步冲突，暂留在本地`);
  }
}

async function pullApiChanges() {
  if (!apiState.ready || !apiState.online || !apiState.authenticated || !apiState.token || apiState.pulling) return;
  apiState.pulling = true;
  try {
    const result = await apiRequest(`/sync/pull?after=${encodeURIComponent(apiState.cursor)}`);
    let changed = false;
    for (const change of result.changes || []) {
      if (change.entityType !== 'idea') continue;
      const index = state.ideas.findIndex(idea => idea.id === change.entityId);
      if (change.deletedAt) {
        if (index >= 0) { state.ideas.splice(index, 1); changed = true; }
        continue;
      }
      if (!change.idea) continue;
      if (index < 0) state.ideas.push(change.idea);
      else if (Number(state.ideas[index].revision || 0) <= Number(change.idea.revision || 0)) state.ideas[index] = change.idea;
      changed = true;
    }
    if (Number(result.cursor) > apiState.cursor) {
      apiState.cursor = Number(result.cursor);
      localStorage.setItem(API_CURSOR_KEY, String(apiState.cursor));
    }
    if (changed) { saveLocalIdeas(); render(); }
  } catch (error) {
    apiState.online = false;
    console.info('Idea Planet pull paused:', error.message);
  } finally { apiState.pulling = false; }
}

let syncTimer = null;
function queueApiSync() {
  apiState.dirty = true;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(flushApiSync, 120);
}

async function flushApiSync() {
  if (!apiState.ready || !apiState.online || apiState.syncing || !apiState.dirty) return;
  apiState.syncing = true;
  apiState.dirty = false;
  try { await pushIdeas(state.ideas); }
  catch (error) { apiState.online = false; apiState.dirty = true; console.info('Idea Planet sync paused:', error.message); }
  finally { apiState.syncing = false; if (apiState.dirty && apiState.online) queueApiSync(); }
}
function loadPinnedTags() { try { const value = JSON.parse(localStorage.getItem('idea-planet-pinned-tags')); return Array.isArray(value) ? value : []; } catch { return []; } }
function savePinnedTags() { localStorage.setItem('idea-planet-pinned-tags', JSON.stringify(state.pinnedTags)); }
function uid() { return `idea-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function esc(value = '') { return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch])); }
function safeHtml(value = '') {
  const template = document.createElement('template'); template.innerHTML = String(value || '');
  template.content.querySelectorAll('script,style,iframe,object,embed,form,button,[onclick],[onload]').forEach(node => node.remove());
  template.content.querySelectorAll('*').forEach(node => {
    [...node.attributes].forEach(attr => { if (/^on/i.test(attr.name) || (attr.name === 'href' && !/^https?:\/\//i.test(attr.value))) node.removeAttribute(attr.name); });
    if (!['A','B','STRONG','I','EM','U','S','BR','P','UL','OL','LI','BLOCKQUOTE','CODE','PRE','H2','H3','H4'].includes(node.tagName)) node.replaceWith(...node.childNodes);
  });
  template.content.querySelectorAll('a').forEach(node => { node.target = '_blank'; node.rel = 'noreferrer'; });
  return template.innerHTML;
}
function bodyMarkup(item, className = '') { return item.bodyHtml ? `<div class="idea-body rich-body ${className}">${safeHtml(item.bodyHtml)}</div>` : `<p class="idea-body ${className}">${esc(item.body || '')}</p>`; }
function formatDate(iso) { return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(iso)); }
function relativeDate(iso) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date);
}
function sourceName(type) { return type === 'bookmark' ? '书签' : type === 'like' ? '点赞候选' : type === 'reply' ? '我的回复' : type === 'authored' ? '我的发帖' : type === 'parent' ? '原帖' : '我的 Idea'; }
function sourceKinds(item) { return [...new Set([...(Array.isArray(item?.sourceTypes) ? item.sourceTypes : []), item?.sourceType].filter(Boolean))]; }
function sourcePriority(kinds) { return ['bookmark', 'like', 'direct', 'authored', 'reply', 'parent'].find(type => kinds.includes(type)) || kinds[0] || 'direct'; }
function sourceClass(type) { return type || 'bookmark'; }
function sourceLabel(item) {
  const kinds = sourceKinds(item);
  if (kinds.includes('bookmark') && kinds.includes('like')) return '书签 + like';
  return sourceName(sourcePriority(kinds));
}
function authorHandle(value) { return String(value || '').match(/@[A-Za-z0-9_]+/)?.[0] || ''; }
function uiIcon(type) {
  const paths = { sweep: '<path d="M5 5l10 10M15 5L5 15"/>', idea: '<path d="M10 2.8a5.1 5.1 0 0 0-3 9.2c.7.5 1 1 1 1.8h4c0-.8.3-1.3 1-1.8a5.1 5.1 0 0 0-3-9.2Z"/><path d="M8 16h4M8.5 18h3"/>', tag: '<path d="M3 5.5V3h2.5L16 13.5 13.5 16 3 5.5Z"/><circle cx="5.5" cy="5.5" r=".8"/>', restore: '<path d="M5 7V3.5L1.8 6.7 5 9.9V7a5.5 5.5 0 1 1-1 6.2"/>' };
  return `<svg class="ui-icon" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">${paths[type]}</svg>`;
}
function markerClass(item) {
  const primary = sourcePriority(sourceKinds(item));
  const shape = item.contentType === 'article' ? 'article' : 'post';
  return `marker-${primary} marker-${shape}`;
}
function shouldShowTitle(item) { return item.contentType === 'article' || (!item.url && item.sourceType === 'direct'); }
function contentBody(item) {
  if (shouldShowTitle(item) && item.title && item.body?.startsWith(item.title)) return item.body.slice(item.title.length).replace(/^\s+/, '');
  return item.body || '';
}
function parentIdea(item) { return item.parentUrl ? (state.ideas.find(candidate => canonicalUrl(candidate.url) === canonicalUrl(item.parentUrl)) || item.parentSnapshot || null) : (item.parentSnapshot || null); }
function canonicalUrl(value) {
  try {
    const url = new URL(value || '');
    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace('twitter.com', 'x.com');
    return `${host}${url.pathname.replace(/\/+$/, '')}`;
  } catch { return String(value || '').split('?')[0].replace(/\/+$/, '').toLowerCase(); }
}
function sameCapture(left, right) {
  const a = canonicalUrl(left?.url);
  const b = canonicalUrl(right?.url);
  if (a && b) return a === b;
  return Boolean(left?.captureKey && right?.captureKey && left.captureKey === right.captureKey);
}
function mergeIdea(target, incoming) {
  const kinds = [...new Set([...sourceKinds(target), ...sourceKinds(incoming)])];
  const richer = (incoming.body || '').length > (target.body || '').length ||
    (incoming.contentStatus === 'expanded' && target.contentStatus !== 'expanded');
  if (richer) Object.assign(target, {
    title: incoming.title || target.title,
    body: incoming.body || target.body,
    bodyHtml: incoming.bodyHtml || target.bodyHtml,
    author: incoming.author || target.author,
    source: incoming.source || target.source,
    capturedAt: incoming.capturedAt || target.capturedAt,
    contentStatus: incoming.contentStatus || target.contentStatus,
    contentType: incoming.contentType || target.contentType,
    url: incoming.url || target.url
  });
  if (target.status !== 'kept' && incoming.status === 'kept') target.status = 'kept';
  if (!target.myThought && incoming.myThought) target.myThought = incoming.myThought;
  if (!target.practice?.goal && incoming.practice?.goal) target.practice = incoming.practice;
  const parentSnapshot = incoming.parent || incoming.parentSnapshot;
  if (parentSnapshot) target.parentSnapshot = parentSnapshot;
  if (incoming.parentUrl) target.parentUrl = incoming.parentUrl;
  if (incoming.relationType) target.relationType = incoming.relationType;
  target.sourceTypes = kinds;
  target.sourceType = sourcePriority(kinds);
  return target;
}
function dedupeIdeas(items) {
  const result = [];
  for (const item of items) {
    const existing = result.find(candidate => sameCapture(candidate, item));
    if (existing) mergeIdea(existing, item);
    else result.push({ ...item, sourceTypes: sourceKinds(item), sourceType: sourcePriority(sourceKinds(item)) });
  }
  return result;
}
function hasSource(item, type) { return sourceKinds(item).includes(type); }
function ideaById(id) { return state.ideas.find(item => item.id === id); }
function visibleIdeas(list) {
  const query = state.query.trim().toLowerCase();
  return list.filter(item => (!state.tag || (item.tags || []).includes(state.tag)) && (!query || [item.title, item.body, item.myThought, item.author, item.source, ...(item.tags || [])].join(' ').toLowerCase().includes(query)));
}

function updateChrome() {
  const planet = state.ideas.filter(item => item.status !== 'dismissed');
  const library = state.ideas;
  document.querySelector('#todayCount').textContent = planet.length;
  document.querySelector('#libraryCount').textContent = library.length;
  document.querySelector('#orbitCount').textContent = library.length;
  document.querySelectorAll('[data-pin-tag]').forEach(button => { const pinned = state.pinnedTags.includes(button.dataset.pinTag); button.classList.toggle('pinned', pinned); button.title = pinned ? 'Unpin Board' : 'Pin Board'; button.setAttribute('aria-label', pinned ? `Unpin ${button.dataset.pinTag}` : `Pin ${button.dataset.pinTag}`); });
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === state.view));
}

function card(item, options = {}) {
  const isDismissed = item.status === 'dismissed';
  const isKept = item.status === 'kept';
  const hasThought = Boolean(item.myThought?.trim());
  const isLong = item.contentType === 'article' || (item.body || '').split('\n').length > 6;
  const isExpanded = expandedIdeas.has(item.id);
  const bodyClass = isLong && !isExpanded ? 'clamp' : '';
  const showTitle = shouldShowTitle(item);
  const parent = parentIdea(item);
  const parentBlock = parent && (item.relationType === 'reply' || item.relationType === 'quote') ? `<div class="parent-divider"></div><div class="parent-quote"><span>原贴</span><div>${esc(contentBody(parent))}</div><small>${esc(authorHandle(parent.author))}</small></div>` : '';
  return `<article class="idea-card" data-id="${esc(item.id)}">
    <div class="card-top"><span class="source-marker ${markerClass(item)}" title="${esc(`${sourceLabel(item)} · ${item.contentType === 'article' ? 'Article' : 'Post'}`)}" aria-label="${esc(`${sourceLabel(item)} · ${item.contentType === 'article' ? 'Article' : 'Post'}`)}"><i></i></span><span class="card-origin">${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noreferrer" aria-label="打开 X 原文" title="打开 X 原文">𝕏</a>` : ''}</span><span class="card-age">${relativeDate(item.createdAt)}</span></div>
    ${showTitle ? `<h3 data-edit="title" tabindex="0" title="点击编辑">${esc(item.title)}</h3>` : ''}
    ${bodyMarkup(item, bodyClass).replace('class="idea-body', 'data-edit="body" tabindex="0" title="点击编辑" class="idea-body')}
    ${parentBlock}
    ${(item.tags || []).length ? `<div class="idea-tags">${item.tags.map(tag => `<button class="idea-tag" data-tag="${esc(tag)}">${esc(tag)}</button>`).join('')}</div>` : ''}
    ${isLong ? `<button class="read-more" data-action="toggleExpand" aria-label="${isExpanded ? '收起' : '展开'}" title="${isExpanded ? '收起' : '展开'}"><span class="fold-arrow ${isExpanded ? 'open' : ''}"></span></button>` : ''}
    ${hasThought ? `<div class="card-source thought">${esc(item.myThought)}</div>` : ''}
    <div class="card-footer">
      <div class="card-actions">${isDismissed ? `<button class="ghost-button" data-action="restore" aria-label="恢复" title="恢复">${uiIcon('restore')}</button>` : `<button class="ghost-button" data-action="dismiss" aria-label="Sweep" title="Sweep">${uiIcon('sweep')}</button><button class="ghost-button accent" data-action="develop" aria-label="Idea" title="Idea">${uiIcon('idea')}</button><button class="ghost-button tag-action" data-action="tags" aria-label="添加标签" title="添加标签">${uiIcon('tag')}</button>`}</div>
      <span class="card-author">${esc(authorHandle(item.author))}</span>
    </div>
  </article>`;
}

function empty(title, text) { return `<div class="empty-state"><div class="empty-icon">✦</div><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`; }

function render() {
  updateChrome();
  const titles = { today: ['PLANET · 2026', 'Ideas'], timeline: ['TIMELINE · 2026', 'Ideas'], library: ['ARCHIVE · 2026', 'All ideas'], ask: ['AGENT · 2026', 'Ask Planet'] };
  document.querySelector('#eyebrow').textContent = titles[state.view][0];
  document.querySelector('#pageTitle').textContent = titles[state.view][1];
  if (state.view === 'today') renderToday();
  if (state.view === 'timeline') renderTimeline();
  if (state.view === 'library') renderLibrary();
  if (state.view === 'ask') renderAsk();
}

function renderToday() {
  const ideas = visibleIdeas(state.ideas.filter(item => item.status !== 'dismissed'));
  const dismissed = state.ideas.filter(item => item.status === 'dismissed').length;
  const pinned = state.pinnedTags.map(tag => ({ tag, ideas: state.ideas.filter(item => (item.tags || []).includes(tag) && item.status !== 'dismissed').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 3) }));
  viewRoot.innerHTML = `<div class="section-head"><div><h2>${state.tag ? esc(state.tag) : 'planet'}</h2><p>${ideas.length} ideas</p></div><span class="count">${ideas.length}</span></div>
    <div class="content-grid ${pinned.length ? '' : 'content-grid-full'}"><div><div class="stack">${ideas.length ? ideas.map(item => card(item)).join('') : empty('planet is quiet', '从 X 带回一个点子。')}</div>
    </div>${!state.tag && pinned.length ? `<aside class="pinned-boards">${pinned.map(board => `<section class="pinned-board"><div class="pinned-head"><button data-tag="${esc(board.tag)}">#${esc(board.tag)}</button><button class="shuffle-board" data-shuffle-tag="${esc(board.tag)}" aria-label="随机显示" title="随机显示">⤨</button></div>${board.ideas.length ? board.ideas.map(item => `<button class="pinned-idea" data-open-idea="${esc(item.id)}">${esc(item.title || contentBody(item).slice(0, 80))}</button>`).join('') : `<span class="pinned-empty">empty</span>`}</section>`).join('')}</aside>` : ''}</div>`;
}

function renderTimeline() {
  const items = visibleIdeas([...state.ideas].filter(item => item.status !== 'dismissed').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  const groups = items.reduce((all, item) => { const key = formatDate(item.createdAt); (all[key] ||= []).push(item); return all; }, {});
  viewRoot.innerHTML = `<div class="section-head"><div><h2>timeline</h2><p>${items.length} moments</p></div><span class="count">${items.length}</span></div>
    ${items.length ? `<div class="timeline">${Object.entries(groups).map(([date, group]) => `<div class="timeline-entry"><p class="timeline-date">${esc(date)}</p>${group.map(item => `${shouldShowTitle(item) ? `<h3>${esc(item.title)}</h3>` : ''}<p>${esc(item.myThought || contentBody(item))}</p><div class="timeline-meta">${sourceLabel(item)} · ${item.status === 'kept' ? '已归档' : '待处理'}</div>`).join('')}</div>`).join('')}</div>` : empty('还没有时间线', '保存第一条内容，给它一个发生的时间。')}`;
}

function renderLibrary() {
  let items = state.ideas;
  if (state.filter === 'bookmark') items = items.filter(item => hasSource(item, 'bookmark'));
  if (state.filter === 'like') items = items.filter(item => hasSource(item, 'like'));
  if (state.filter === 'mine') items = items.filter(item => item.myThought?.trim());
  if (state.filter === 'dismissed') items = items.filter(item => item.status === 'dismissed');
  items = visibleIdeas(items);
  viewRoot.innerHTML = `<div class="section-head"><div><h2>all ideas</h2><p>${items.length} ideas</p></div><span class="count">${items.length}</span></div>
    <div class="library-toolbar">${[['all','全部'],['bookmark','书签'],['like','点赞候选'],['mine','我的想法'],['dismissed','已放下']].map(([key, label]) => `<button class="filter-button ${state.filter === key ? 'active' : ''}" data-filter="${key}">${label}</button>`).join('')}</div>
    ${items.length ? `<div class="library-grid">${items.map(item => card(item, { compact: true })).join('')}</div>` : empty('这里还没有内容', '当你决定保留一条内容，它就会来到这里。')}`;
}

function renderAsk() {
  const running = agentState.status === 'queued' || agentState.status === 'running';
  const output = agentState.output;
  viewRoot.innerHTML = `<section class="ask-shell">
    <div class="ask-intro"><p class="eyebrow">LOCAL RECALL · NO EXTERNAL MODEL</p><h2>让 Planet 帮你找回<br />曾经想过的东西。</h2><p>先从一个真实问题开始。当前版本只做本地 Recall：它会在你的 Idea 中寻找相关内容，并保留任务和引用关系。</p></div>
    <form class="ask-form" id="askForm">
      <div class="ask-types"><button type="button" class="ask-type active">找相关 Idea</button><span>更多任务类型会在 Agent Kernel 稳定后加入</span></div>
      <textarea name="prompt" required ${running ? 'disabled' : ''} placeholder="例如：我过去关于 AI 产品审美都想过什么？">${esc(agentState.prompt)}</textarea>
      <div class="ask-form-footer"><span>${agentState.status === 'offline' ? '后端暂不可用，仍可继续浏览本地 Planet。' : 'Local Recall · 不调用外部模型'}</span><button class="solid-button" ${running ? 'disabled' : ''}>${running ? '正在查找…' : '开始 Recall'}</button></div>
    </form>
    ${agentState.error ? `<div class="ask-error">${esc(agentState.error)}</div>` : ''}
    ${output ? `<article class="agent-result"><div class="agent-result-head"><span>RECALL RESULT</span><small>${esc(output.createdAt || '')}</small></div><div class="agent-result-body">${esc(output.content?.text || '')}</div><div class="agent-citations">${(output.content?.citations || []).map(citation => `<button data-open-idea="${esc(citation.ideaId)}">${esc(citation.title || citation.ideaId)}</button>`).join('')}</div><div class="agent-result-actions"><button class="solid-button" data-action="saveAgentOutput" data-output-id="${esc(output.id)}">保存为新的 Idea</button></div></article>` : ''}
  </section>`;
  document.querySelector('#askForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const prompt = String(new FormData(event.currentTarget).get('prompt') || '').trim();
    if (prompt) runAgentTask(prompt);
  });
}

async function runAgentTask(prompt) {
  if (!apiState.online) {
    agentState.status = 'offline'; agentState.error = '后端还没有连接，当前无法运行 Agent。'; renderAsk(); return;
  }
  agentState.prompt = prompt; agentState.status = 'queued'; agentState.output = null; agentState.error = ''; renderAsk();
  try {
    const created = await apiRequest('/agent/tasks', { method: 'POST', body: JSON.stringify({ type: 'recall', prompt }) });
    agentState.task = created.task;
    await pollAgentTask(created.task.id);
  } catch (error) {
    agentState.status = 'failed'; agentState.error = error.message; renderAsk();
  }
}

async function pollAgentTask(taskId) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const detail = await apiRequest(`/agent/tasks/${encodeURIComponent(taskId)}`);
    agentState.task = detail.task;
    agentState.status = detail.task.status;
    if (detail.task.status === 'succeeded') {
      agentState.output = detail.outputs?.at(-1) || null; agentState.error = ''; renderAsk(); return;
    }
    if (['failed', 'cancelled'].includes(detail.task.status)) {
      agentState.error = detail.task.error?.message || `Agent task ${detail.task.status}`; renderAsk(); return;
    }
    renderAsk();
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  agentState.status = 'failed'; agentState.error = 'Agent task timed out while waiting for a result.'; renderAsk();
}

async function saveAgentOutput(outputId) {
  try {
    const result = await apiRequest(`/agent/outputs/${encodeURIComponent(outputId)}/save-as-idea`, { method: 'POST', body: JSON.stringify({ title: '' }) });
    state.ideas.unshift(result.idea); saveLocalIdeas(); agentState.output = null; render(); toast('Agent 结果已保存为新的 Idea');
  } catch (error) { agentState.error = error.message; renderAsk(); }
}

let pendingComposerPrompt = '';
function showAuthModal(mode = 'login') {
  const register = mode === 'register';
  const menu = document.querySelector('#menuPanel');
  if (menu && !menu.hidden) toggleMenu();
  openModal(`<div class="auth-panel"><p class="landing-eyebrow">IDEA PLANET · YOUR SPACE</p><h2 id="modalTitle">${register ? '创建你的 Idea Planet' : '回到你的 Idea Planet'}</h2><p class="modal-intro">${register ? '从一个想法开始，建立属于你的创作空间。' : '登录后继续整理你的想法和创作。'}</p><form id="authForm" class="form-grid"><div class="field"><label for="authEmail">邮箱</label><input id="authEmail" name="email" type="email" autocomplete="email" required placeholder="you@example.com" /></div>${register ? '<div class="field"><label for="authDisplayName">称呼（可选）</label><input id="authDisplayName" name="displayName" autocomplete="name" placeholder="你的名字" /></div>' : ''}<div class="field"><label for="authPassword">密码</label><input id="authPassword" name="password" type="password" minlength="8" autocomplete="${register ? 'new-password' : 'current-password'}" required placeholder="至少 8 个字符" /></div><div id="authError" class="auth-error" hidden></div><div class="form-actions"><button type="button" class="cancel-button" data-action="closeModal">稍后再说</button><button class="solid-button" id="authSubmit">${register ? '创建账户' : '登录'}</button></div></form><p class="auth-switch">${register ? '已经有账户？' : '还没有账户？'} <button type="button" data-auth-mode="${register ? 'login' : 'register'}">${register ? '登录' : '免费创建'}</button></p></div>`);
  document.querySelector('#authForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const submit = document.querySelector('#authSubmit');
    const errorNode = document.querySelector('#authError');
    submit.disabled = true;
    if (errorNode) errorNode.hidden = true;
    try {
      const endpoint = register ? '/auth/register' : '/auth/login';
      const result = await apiRequest(endpoint, { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password'), displayName: form.get('displayName') || undefined }) });
      if (!result.token) throw new Error('登录响应缺少会话');
      apiState.token = result.token;
      apiState.cursor = 0;
      apiState.authenticated = true;
      localStorage.setItem(API_TOKEN_KEY, apiState.token);
      localStorage.removeItem(API_CURSOR_KEY);
      closeModal();
      history.replaceState({}, '', '/#today');
      showWorkspace();
      await bootstrapApi();
      if (pendingComposerPrompt) { const prompt = pendingComposerPrompt; pendingComposerPrompt = ''; modalCapture({ body: prompt }); }
    } catch (error) {
      if (errorNode) { errorNode.textContent = error.message; errorNode.hidden = false; }
    } finally { submit.disabled = false; }
  });
  document.querySelector('#authEmail')?.focus();
}

function startCreating() {
  pendingComposerPrompt = String(document.querySelector('.landing-composer textarea')?.value || '').trim();
  showWorkspace(); state.view = 'today'; history.replaceState({}, '', '/#today'); render();
  if (pendingComposerPrompt) { const prompt = pendingComposerPrompt; pendingComposerPrompt = ''; modalCapture({ body: prompt }); }
}

function toggleMenu() {
  const panel = document.querySelector('#menuPanel');
  const toggle = document.querySelector('.menu-toggle');
  if (!panel) return;
  panel.hidden = !panel.hidden;
  toggle?.setAttribute('aria-expanded', String(!panel.hidden));
  document.body.classList.toggle('menu-open', !panel.hidden);
}

function openModal(content) { document.querySelector('#modalContent').innerHTML = content; document.querySelector('#modalBackdrop').hidden = false; }
function closeModal() { document.querySelector('#modalBackdrop').hidden = true; document.querySelector('#modalContent').innerHTML = ''; }
function modalCapture(prefill = {}) {
  openModal(`<h2 id="modalTitle">New idea</h2><form id="captureForm" class="form-grid">
    <div class="field"><label>标题（可选）</label><input name="title" value="${esc(prefill.title || '')}" placeholder="一个名字，帮助你以后找到它" /></div>
    <div class="field"><label>正文</label><textarea name="body" required autofocus placeholder="写下一个 Idea">${esc(prefill.body || '')}</textarea></div>
    <div class="field"><label>标签</label><div class="tag-picker">${['Action', 'Longterm', 'Method', 'Question', 'Reference', 'Emotion'].map(tag => `<button type="button" class="tag-choice" data-capture-tag="${tag}">${tag}</button>`).join('')}</div><input name="tags" id="captureTags" type="hidden" /></div>
    <div class="form-actions"><button type="button" class="cancel-button" data-action="closeModal">稍后再说</button><button class="solid-button">送入星球</button></div>
  </form>`);
  document.querySelectorAll('[data-capture-tag]').forEach(button => button.addEventListener('click', () => { button.classList.toggle('selected'); document.querySelector('#captureTags').value = [...document.querySelectorAll('[data-capture-tag].selected')].map(node => node.dataset.captureTag).join(','); }));
  document.querySelector('#captureForm').addEventListener('submit', event => { event.preventDefault(); const form = new FormData(event.currentTarget); const idea = { id: uid(), sourceType: 'direct', sourceTypes: ['direct'], author: '我', title: String(form.get('title') || '').trim(), body: String(form.get('body') || '').trim(), tags: String(form.get('tags') || '').split(',').map(tag => tag.trim()).filter(Boolean), source: '我的 Idea', url: '', createdAt: new Date().toISOString(), status: 'kept', myThought: '', practice: { goal: '', due: '', result: '', done: false } }; state.ideas.unshift(idea); saveIdeas(); closeModal(); state.view = 'today'; render(); toast('已进入你的 Planet'); });
}

function modalThought(item) {
  const tagChoices = ['Action', 'Longterm', 'Method', 'Question', 'Reference', 'Emotion'];
  const prompts = ['New idea?', 'Need Action?', 'What follows?', 'Keep going?', 'Make it yours?'];
  const prompt = prompts[Math.floor(Math.random() * prompts.length)];
  openModal(`<h2 id="modalTitle">${prompt}</h2><div class="source-quote"><span class="quote-mark">“</span><div>${esc(item.body || item.title)}</div><small>${esc(item.author || '')}</small></div><form id="thoughtForm" class="form-grid" style="margin-top:18px"><div class="field"><label for="ideaBody">Idea</label><textarea id="ideaBody" name="thought" required placeholder="写下你想到的下一步、判断或问题"></textarea></div><div class="field"><label>标签</label><div class="tag-picker">${tagChoices.map(tag => `<button type="button" class="tag-choice" data-choice-tag="${tag}">${tag}</button>`).join('')}</div><input id="ideaTags" name="tags" type="hidden" /></div><div class="form-actions"><button type="button" class="cancel-button" data-action="closeModal">取消</button><button class="solid-button">保存 Idea</button></div></form>`);
  document.querySelector('#ideaBody').focus();
  document.querySelectorAll('[data-choice-tag]').forEach(button => button.addEventListener('click', () => { button.classList.toggle('selected'); const tags = [...document.querySelectorAll('[data-choice-tag].selected')].map(node => node.dataset.choiceTag); document.querySelector('#ideaTags').value = tags.join(','); }));
  document.querySelector('#thoughtForm').addEventListener('submit', event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = String(form.get('thought') || '').trim();
    if (!body) return;
    const tags = [...new Set(String(form.get('tags') || '').split(/[,，]/).map(tag => tag.trim()).filter(Boolean))];
    state.ideas.unshift({
      id: uid(), sourceType: 'direct', sourceTypes: ['direct'], author: '我',
      title: '', body, tags, url: '', parentId: item.id, parentUrl: item.url || '',
      relationType: 'extends', createdAt: new Date().toISOString(), status: 'kept'
    });
    saveIdeas(); closeModal(); state.view = 'today'; state.tag = ''; state.query = '';
    document.querySelector('#searchInput').value = '';
    history.replaceState({}, '', '/#today'); render(); toast('已进入 Planet');
  });
}

function modalTags(item) {
  const choices = ['Action', 'Longterm', 'Method', 'Question', 'Reference', 'Emotion'];
  const selected = new Set(item.tags || []);
  openModal(`<h2 id="modalTitle">Tags</h2><div class="tag-picker tag-picker-large">${choices.map(tag => `<button type="button" class="tag-choice ${selected.has(tag) ? 'selected' : ''}" data-choice-tag="${tag}">${tag}</button>`).join('')}</div><div class="form-actions"><button type="button" class="cancel-button" data-action="closeModal">取消</button><button type="button" class="solid-button" data-action="saveTags">保存</button></div>`);
  document.querySelectorAll('[data-choice-tag]').forEach(button => button.addEventListener('click', () => button.classList.toggle('selected')));
  document.querySelector('[data-action="saveTags"]').addEventListener('click', () => {
    item.tags = [...document.querySelectorAll('[data-choice-tag].selected')].map(node => node.dataset.choiceTag);
    saveIdeas(); closeModal(); render(); toast('标签已更新');
  });
}


function exportData() { const blob = new Blob([JSON.stringify(state.ideas, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'idea-planet-backup.json'; link.click(); URL.revokeObjectURL(link.href); toast('数据备份已下载'); }
function toast(message) { const node = document.querySelector('#toast'); node.textContent = message; node.classList.add('show'); clearTimeout(window.__toast); window.__toast = setTimeout(() => node.classList.remove('show'), 2400); }

function handleAction(action, item) {
  if (action === 'dismiss') { const node = document.querySelector(`[data-id="${CSS.escape(item.id)}"]`); node?.classList.add('sweeping'); setTimeout(() => { item.status = 'dismissed'; saveIdeas(); render(); toast('已 Sweep'); }, 240); }
  if (action === 'restore') { item.status = 'kept'; saveIdeas(); render(); toast('已回到 Planet'); }
  if (action === 'develop') modalThought(item);
  if (action === 'tags') modalTags(item);
  if (action === 'toggleExpand') { if (expandedIdeas.has(item.id)) expandedIdeas.delete(item.id); else expandedIdeas.add(item.id); render(); }
}

document.addEventListener('pointerdown', event => {
  if (!activeEditor) return;
  if (!event.target.closest('[data-edit]')) { activeEditor.__finishEdit?.(true); activeEditor = null; }
}, true);
document.addEventListener('click', event => {
  const authMode = event.target.closest('[data-auth-mode]');
  if (authMode) { event.preventDefault(); showAuthModal(authMode.dataset.authMode || 'login'); return; }
  if (event.target.closest('[data-menu-link]')) { toggleMenu(); return; }
  const editable = event.target.closest('[data-edit]'); if (editable) { const article = editable.closest('[data-id]'); const item = article && ideaById(article.dataset.id); if (item && !editable.isContentEditable) { const original = editable.innerText; activeEditor = editable; editable.contentEditable = 'true'; editable.classList.add('editing'); editable.focus(); const finish = save => { editable.contentEditable = 'false'; editable.removeAttribute('contenteditable'); editable.classList.remove('editing'); editable.style.outline = ''; if (activeEditor === editable) activeEditor = null; if (save) { const value = editable.innerText.trim(); if (editable.dataset.edit === 'title') item.title = value; else { item.body = value; item.bodyHtml = ''; } saveIdeas(); toast('已更新'); } else editable.innerText = original; editable.removeEventListener('blur', onBlur); }; const onBlur = () => { finish(true); window.requestAnimationFrame(() => editable.classList.remove('editing')); }; editable.__finishEdit = finish; editable.addEventListener('blur', onBlur, { once: true }); editable.addEventListener('keydown', keyEvent => { if (keyEvent.key === 'Escape') { keyEvent.preventDefault(); editable.removeEventListener('blur', onBlur); finish(false); } if (keyEvent.key === 'Enter' && editable.dataset.edit === 'title') { keyEvent.preventDefault(); editable.blur(); } }); } return; }
  const pin = event.target.closest('[data-pin-tag]'); if (pin) { event.preventDefault(); event.stopPropagation(); const tag = pin.dataset.pinTag; state.pinnedTags = state.pinnedTags.includes(tag) ? state.pinnedTags.filter(item => item !== tag) : [...state.pinnedTags, tag]; savePinnedTags(); render(); return; }
  const shuffle = event.target.closest('[data-shuffle-tag]'); if (shuffle) { event.preventDefault(); const tag = shuffle.dataset.shuffleTag; const candidates = state.ideas.filter(item => (item.tags || []).includes(tag) && item.status !== 'dismissed'); if (candidates.length) { const choice = candidates[Math.floor(Math.random() * candidates.length)]; const node = document.querySelector(`[data-open-idea="${CSS.escape(choice.id)}"]`); node?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } return; }
  const openIdea = event.target.closest('[data-open-idea]'); if (openIdea) { const item = ideaById(openIdea.dataset.openIdea); if (item) { expandedIdeas.add(item.id); document.querySelector(`[data-id="${CSS.escape(item.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } return; }
  const nav = event.target.closest('[data-view]'); if (nav) { event.preventDefault(); state.view = nav.dataset.view; if (nav.hasAttribute('data-planet')) state.tag = ''; if (state.view !== 'library') state.filter = 'all'; window.location.hash = state.view; render(); return; }
  const filter = event.target.closest('[data-filter]'); if (filter) { state.filter = filter.dataset.filter; render(); return; }
  const tag = event.target.closest('[data-tag]'); if (tag) { event.preventDefault(); state.tag = tag.dataset.tag; state.view = 'today'; history.replaceState({}, '', `/#tag/${encodeURIComponent(state.tag)}`); render(); return; }
  const button = event.target.closest('[data-action]'); if (!button) return;
  const action = button.dataset.action;
  if (action === 'startCreating') return startCreating();
  if (action === 'toggleMenu') return toggleMenu();
  if (action === 'dismissCookie') { localStorage.setItem('idea-planet-cookie-choice', 'saved'); document.querySelector('#cookieBanner')?.setAttribute('hidden', ''); return; }
  if (action === 'composerPrompt') return;
  if (action === 'capture') return modalCapture();
  if (action === 'closeModal') return closeModal();
  if (action === 'export') return exportData();
  if (action === 'saveAgentOutput') return saveAgentOutput(button.dataset.outputId);
  const article = button.closest('[data-id]'); if (article) handleAction(action, ideaById(article.dataset.id));
});
document.querySelector('#modalBackdrop').addEventListener('click', event => { if (event.target.id === 'modalBackdrop') closeModal(); });
document.querySelector('#searchInput').addEventListener('input', event => { state.query = event.target.value; render(); });
window.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'idea-planet-extension' || event.data?.type !== 'IMPORT') return;
  const captures = Array.isArray(event.data.payload) ? event.data.payload : [];
  const updates = [];
  const fresh = [];
  const parentFor = item => item.parent && item.parent.url ? item.parent : null;
  for (const item of captures.filter(item => item?.captureId && typeof item.body === 'string')) {
    const parentCapture = parentFor(item);
    if (parentCapture) {
      const existingParent = [...state.ideas, ...fresh].find(idea => sameCapture(idea, parentCapture));
      if (existingParent) { mergeIdea(existingParent, parentCapture); updates.push(existingParent); }
      else fresh.push({ ...parentCapture, id: uid(), sourceType: 'parent', sourceTypes: ['parent'], createdAt: item.capturedAt || new Date().toISOString(), status: 'kept' });
    }
    const old = [...state.ideas, ...fresh].find(idea => idea.captureId === item.captureId || sameCapture(idea, item));
    if (old) {
      const before = JSON.stringify(old);
      mergeIdea(old, item);
      if (JSON.stringify(old) !== before) updates.push(old);
      continue;
    }
    const parent = parentFor(item);
    if (parent && ![...state.ideas, ...fresh].some(idea => sameCapture(idea, parent))) {
      fresh.push({ id: uid(), captureId: `${item.captureId}-parent`, captureKey: parent.captureKey || `parent:${parent.url}`, sourceType: 'parent', sourceTypes: ['parent'], relationType: item.relationType || 'reply', author: parent.author || '原帖作者', contentStatus: parent.contentStatus, title: parent.title || '原帖', body: parent.body || '', source: item.relationType === 'quote' ? '引用所包含的原帖' : '回复所引用的原帖', url: parent.url, createdAt: item.capturedAt || new Date().toISOString(), status: 'kept', myThought: '', practice: { goal: '', due: '', result: '', done: false } });
    }
    fresh.push({
    id: uid(), captureId: item.captureId, captureKey: item.captureKey || '', sourceType: item.sourceType || 'direct', sourceTypes: [...new Set([...(item.sourceTypes || []), item.sourceType || 'direct'])], author: item.author || 'X 上的作者',
    contentStatus: item.contentStatus, contentType: item.contentType || 'post', parentUrl: item.parentUrl || '', relationType: item.relationType || '',
    title: item.title || '来自 X 的新 Idea', body: item.body || item.title || '', bodyHtml: item.bodyHtml || '', tags: item.tags || [], parentSnapshot: item.parent || null, source: item.source || `来自 X 的${item.sourceType === 'bookmark' ? '书签' : '喜欢'}`, url: item.url || '',
    createdAt: item.capturedAt || new Date().toISOString(), status: 'kept', myThought: '', practice: { goal: '', due: '', result: '', done: false }
    });
  }
  if (!fresh.length && !updates.length) return;
  state.ideas = dedupeIdeas([...fresh, ...state.ideas]);
  saveIdeas(); state.view = 'today'; history.replaceState({}, '', '/#today'); render(); toast(updates.length ? `${updates.length} 条内容已更新` : `${fresh.length} 条内容已进入你的星球`);
});

function readCaptureQuery() {
  const params = new URLSearchParams(location.search); if (!params.has('capture')) return;
  try { const capture = JSON.parse(decodeURIComponent(params.get('capture'))); modalCapture(capture); history.replaceState({}, '', location.pathname); } catch { /* ignore malformed extension data */ }
}
const hashView = location.hash.slice(1); if (['today', 'timeline', 'library', 'ask'].includes(hashView)) state.view = hashView;
// Local-first default: open the personal workspace immediately. The landing
// page remains available as a public presentation, but never gates local use.
showWorkspace();
render();
readCaptureQuery();
apiRequest('/public/home').then(data => { landingData = data; renderLanding(); }).catch(error => console.info('Idea Planet landing content unavailable:', error.message));
bootstrapApi();
document.addEventListener('visibilitychange', () => { if (!document.hidden) apiState.online ? pullApiChanges() : bootstrapApi(); });
window.addEventListener('online', () => { apiState.online ? pullApiChanges() : bootstrapApi(); });
window.setInterval(() => { apiState.online ? pullApiChanges() : bootstrapApi(); }, 30_000);
