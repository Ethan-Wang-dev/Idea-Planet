let pending = Promise.resolve();

const canonicalUrl = value => {
  try {
    const url = new URL(value || '');
    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace('twitter.com', 'x.com');
    const path = url.pathname.replace(/\/+$/, '');
    return `${host}${path}`;
  } catch {
    return String(value || '').split('?')[0].replace(/\/+$/, '').toLowerCase();
  }
};

const sourceList = item => [...new Set([...(Array.isArray(item.sourceTypes) ? item.sourceTypes : []), item.sourceType].filter(Boolean))];
const sourcePriority = ['bookmark', 'like', 'direct', 'authored', 'reply', 'parent'];
const primarySource = sources => sourcePriority.find(type => sources.includes(type)) || sources[0] || 'direct';
const sameCapture = (a, b) => {
  const left = canonicalUrl(a.url);
  const right = canonicalUrl(b.url);
  return Boolean(left && right) ? left === right : Boolean(a.captureKey && b.captureKey && a.captureKey === b.captureKey);
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'capture' && message.data) {
    const data = { ...message.data, captureId: crypto.randomUUID(), capturedAt: new Date().toISOString() };
    pending = pending.catch(() => {}).then(async () => {
      const result = await chrome.storage.local.get({ queue: [] });
      const queue = [...result.queue];
      const existingIndex = queue.findIndex(item => sameCapture(item, data));
      if (existingIndex === -1) queue.push(data);
      else {
        const existing = queue[existingIndex];
        const sources = [...new Set([...sourceList(existing), ...sourceList(data)])];
        const richer = (data.body || '').length > (existing.body || '').length ||
          (data.contentStatus === 'expanded' && existing.contentStatus !== 'expanded');
        queue[existingIndex] = {
          ...existing,
          ...(richer ? data : {}),
          captureId: existing.captureId,
          parent: data.parent || existing.parent,
          parentUrl: data.parentUrl || existing.parentUrl,
          relationType: data.relationType || existing.relationType,
          captureKey: existing.captureKey || data.captureKey,
          sourceTypes: sources,
          sourceType: primarySource(sources)
        };
      }
      await chrome.storage.local.set({ queue });
    });
    pending.then(() => sendResponse({ ok: true }), error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'drain') {
    pending = pending.catch(() => {}).then(async () => {
      const result = await chrome.storage.local.get({ queue: [] });
      await chrome.storage.local.set({ queue: [] });
      return result.queue;
    });
    pending.then(queue => sendResponse({ queue }), () => sendResponse({ queue: [] }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => chrome.storage.local.get({ queue: [] }, () => {}));
