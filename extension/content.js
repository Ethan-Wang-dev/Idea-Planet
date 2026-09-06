(() => {
  const observed = 'data-idea-planet-observed';
  const capturedKeys = new Map();
  const clean = value => (value || '').replace(/\s+/g, ' ').trim();
  const quoteFor = root => {
    const node = root?.querySelector('[data-href*="/status/"], [data-testid="quoteTweet"], [role="link"][tabindex="0"]:has([data-testid="tweetText"]), article');
    return node?.querySelector('article') || node || null;
  };
  const owned = (root, selector) => {
    const quote = quoteFor(root);
    return [...root.querySelectorAll(selector)].filter(node => !quote?.contains(node));
  };
  const htmlFor = element => {
    if (!element) return '';
    const copy = element.cloneNode(true);
    copy.querySelectorAll('[data-testid="tweet-text-show-more-link"], button, [role="button"], script, style').forEach(node => node.remove());
    copy.querySelectorAll('a').forEach(link => { link.setAttribute('target', '_blank'); link.setAttribute('rel', 'noreferrer'); });
    return copy.innerHTML.trim();
  };
  const bodyNodesFor = root => {
    const legacy = owned(root, '[data-testid="tweetText"]');
    if (legacy.length) return legacy;
    const nodes = owned(root, '[class*="whitespace-pre-wrap"][class*="break-words"]')
      .filter(node => !node.closest('a, button') && !/text-subtext|text-gray|text-blue|font-bold/.test(node.className) && node.textContent.trim());
    const unique = [];
    const seen = new Set();
    for (const node of nodes) {
      const key = (node.innerText || node.textContent || '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(node);
    }
    return unique.filter(node => !unique.some(other => other !== node && other.contains(node)));
  };

  // These are controls and metadata rendered around the post, not the post itself.
  const noise = [
    /^(show translation|translate|translation|show more|show less|显示翻译|翻译|显示更多|显示更少)$/i,
    /^(quote|relevant|view quotes|view post|查看引用|查看推文|相关)$/i,
    /^(reply|repost|like|unlike|bookmark|share|more|follow|subscribe|回复|转发|喜欢|取消喜欢|书签|分享|更多|关注|订阅)$/i,
    /^(remove|add) (bookmark|bookmarks)$/i,
    /^\d{1,2}:\d{2}(?:\s*[ap]m)?$/i,
    /^\d+(?:\.\d+)?[smhd]$/i
  ];

  const isNoise = line => !line || noise.some(pattern => pattern.test(line));
  const stripChromeText = line => line
    .replace(/^(quote|relevant|view quotes|view post|引用|相关|查看引用|查看推文)\s+/i, '')
    .replace(/\s+(show translation|translate|显示翻译|翻译)$/i, '')
    .trim();
  const labelFor = element => [element.getAttribute('aria-label'), element.getAttribute('title'), element.getAttribute('data-testid'), element.textContent]
    .filter(Boolean).join(' ').toLowerCase();

  const actionKind = button => {
    const label = labelFor(button);
    if (!label) return null;
    if (/unlike|remove\s*bookmarks?|unbookmark|取消喜欢|取消点赞|移除书签|已喜欢|已收藏/.test(label)) return null;
    if (/bookmark|书签|收藏/.test(label)) return 'bookmark';
    if (/like|喜欢|点赞/.test(label)) return 'like';
    return null;
  };

  const authorFor = article => {
    const user = article.querySelector('[data-testid="User-Name"]');
    if (user) {
      const lines = user.innerText.split('\n').map(clean).filter(Boolean);
      const handle = lines.find(line => /^@[A-Za-z0-9_]+$/.test(line));
      if (handle) return handle;
    }
    const handleNode = article.querySelector('[alt^="@"], a[href^="/"] .truncate');
    if (handleNode) return (handleNode.getAttribute('alt') || handleNode.textContent || '').match(/@[A-Za-z0-9_]+/)?.[0] || '';
    return '';
  };

  const postTextFor = (article, author, sourceUrl = '') => {
    // Article pages expose engagement counts in the same text container as the
    // longform body. They are content noise, even though standalone numbers in
    // ordinary posts can be meaningful and must remain untouched.
    const isArticle = /\/article\/|\/i\/articles?\//i.test(sourceUrl || statusUrlFor(article));
    const articleMetric = /^(?:\d{1,3}(?:[,.]\d{3})*|\d+(?:\.\d+)?\s*[kmb])$/i;
    const authorLines = new Set(author.split('·').map(clean).filter(Boolean));
    const seen = new Set();
    const cleanContent = (value, stripMetrics = isArticle) => {
      const output = [];
      String(value || '').split(/\n/).map(line => clean(line)).map(stripChromeText).forEach(line => {
        if (!line) { if (output.length && output[output.length - 1] !== '') output.push(''); return; }
        const key = line.toLowerCase();
        if (isNoise(line) || authorLines.has(line) || line.startsWith('@')) return;
        if (stripMetrics && articleMetric.test(line)) return;
        if (seen.has(key)) return;
        seen.add(key); output.push(line);
      });
      while (output[0] === '') output.shift();
      while (output[output.length - 1] === '') output.pop();
      return output.join('\n');
    };

    // tweetText is the cleanest source and keeps a long post or quoted post intact.
    const textNodes = bodyNodesFor(article);
    const longform = article.querySelector('[data-testid="longformArticle"], [data-testid="articleBody"], [role="article"]');
    if (!textNodes.length && longform) return cleanContent(longform.innerText || longform.textContent || '', true);
    if (textNodes.length) {
      // Preserve actual content: repeated lines and numbers are meaningful in
      // ordinary posts. Article metrics are filtered by cleanContent above.
      const values = textNodes.map(node => {
        const copy = node.cloneNode(true);
        copy.querySelectorAll('[data-testid="tweet-text-show-more-link"]').forEach(el => el.remove());
        return (node.innerText || copy.textContent || '').replace(/\s*(Show more|显示更多)\s*$/i, '').trim();
      }).filter(Boolean);
      return isArticle ? values.map(value => cleanContent(value, true)).filter(Boolean).join('\n\n') : values.join('\n\n');
    }
    return cleanContent(article.innerText || '', true);
  };

  const captureArticle = (article, kind) => {
    const url = statusUrlFor(article) || location.href;
    const author = authorFor(article);
    const body = postTextFor(article, author, url);
    const textNode = bodyNodesFor(article)[0] || article.querySelector('[data-testid="longformArticle"], [data-testid="articleBody"]');
    // Quote posts contain the original post as a nested article. Replies in a
    // thread commonly place the parent article immediately before the reply.
    // X has several quote layouts. Some put the original in a nested article,
    // while others only expose its permalink in a wrapper around that article.
    // Prefer a descendant with a different canonical status URL so the outer
    // post cannot be mistaken for its own parent.
    const nestedParent = [...article.querySelectorAll('article')]
      .find(candidate => {
        const candidateUrl = statusUrlFor(candidate);
        return candidateUrl && candidateUrl !== url;
      }) || quoteFor(article);
    const parent = nestedParent || null;
    const parentUrl = statusUrlFor(parent);
    const isQuote = Boolean(nestedParent);
    const contentType = /\/article\/|\/i\/articles?\//i.test(url) ? 'article' : 'post';
    return {
      title: body.split('\n')[0]?.slice(0, 120) || '来自 X 的新 Idea',
      body: body || '未能提取帖子正文，请打开原帖补充内容。',
      bodyHtml: htmlFor(textNode),
      url,
      note: '',
      author,
      sourceType: kind,
      contentType,
      relationType: isQuote ? 'quote' : (parentUrl ? 'reply' : ''),
      contentStatus: showMoreFor(article) ? 'partial' : 'expanded',
      captureKey: `${kind}:${url}`
      , parentUrl: parentUrl && parentUrl !== url ? parentUrl : ''
      , parent: parent && parentUrl && parentUrl !== url ? (() => { const p = captureArticle(parent, 'parent'); delete p.parent; return p; })() : null
    };
  };

  const statusUrlFor = article => {
    if (!article) return '';
    const explicit = article.getAttribute('data-href') || article.closest('[data-href]')?.getAttribute('data-href');
    if (explicit && /\/(status|articles?)\//.test(explicit)) return new URL(explicit, 'https://x.com').href;
    const links = owned(article, 'a[href*="/status/"], a[href*="/article/"], a[href*="/i/article"]');
    const link = links.find(node => node.querySelector('time')) || links.find(node => !/\/i\/status\//.test(node.href)) || links[0];
    return link?.href?.match(/^https?:\/\/(?:x|twitter)\.com\/[^/]+\/(?:status|article)\/[^?#]+/)?.[0] ||
      link?.href?.match(/^https?:\/\/(?:x|twitter)\.com\/i\/articles?\/[^?#]+/)?.[0] || link?.href || '';
  };
  const articleForUrl = url => {
    if (!url) return null;
    const target = url.split('?')[0].replace(/\/$/, '');
    return [...document.querySelectorAll('article')].find(article => statusUrlFor(article).split('?')[0].replace(/\/$/, '') === target) || null;
  };

  const showMoreFor = article => {
    if (!article) return null;
    const candidates = [
      article.querySelector('[data-testid="tweet-text-show-more-link"]'),
      ...owned(article, 'button, [role="button"], a')
    ].filter(Boolean);
    return candidates.find(element => /^(show more|显示更多)$/i.test(clean(element.innerText || element.getAttribute('aria-label')))) || null;
  };

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const expandBeforeCapture = async (article, url) => {
    const current = articleForUrl(url) || article;
    const showMore = showMoreFor(current);
    if (!showMore) return current;
    const beforeText = postTextFor(current, authorFor(current), url);
    showMore.click();
    // X may replace the article node and load the hidden text asynchronously.
    let lastText = beforeText;
    let stableSince = Date.now();
    for (let attempt = 0; attempt < 67; attempt += 1) {
      await wait(120);
      const next = articleForUrl(url) || current;
      const text = postTextFor(next, authorFor(next), url);
      if (text !== lastText) { lastText = text; stableSince = Date.now(); }
      if (next.isConnected && !showMoreFor(next) && text !== beforeText && Date.now() - stableSince >= 480) return next;
    }
    throw new Error('全文尚未加载完成，请打开原帖展开后重新采集');
  };

  const activeKindFor = article => {
    const labels = [...article.querySelectorAll('button, [role="button"]')].map(labelFor).join(' ');
    if (/remove\s*bookmarks?|已收藏|移除书签/.test(labels)) return 'bookmark';
    if (/unlike|已喜欢|取消喜欢|取消点赞/.test(labels)) return 'like';
    return 'direct';
  };

  const send = async data => {
    const fingerprint = JSON.stringify([data.body, data.bodyHtml, data.parentUrl, data.relationType, data.parent]);
    if (!data.captureKey || capturedKeys.get(data.captureKey) === fingerprint) return;
    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: 'capture', data });
    } catch {
      throw new Error('插件已更新，请刷新 X 页面后重试');
    }
    if (!response?.ok) throw new Error('保存失败，请重新采集');
    capturedKeys.set(data.captureKey, fingerprint);
  };

  const addEffectStyles = () => {
    if (document.getElementById('idea-planet-effect-styles')) return;
    const style = document.createElement('style');
    style.id = 'idea-planet-effect-styles';
    style.textContent = `
      .idea-planet-ripple { position: fixed; z-index: 2147483647; width: 10px; height: 10px; margin: -5px; border: 1px solid rgba(238,118,82,.6); border-radius: 50%; pointer-events: none; animation: ideaPlanetRipple 850ms ease-out forwards; }
      .idea-planet-ripple.bookmark { border-color: rgba(114,155,179,.6); }
      .idea-planet-orb { position: fixed; z-index: 2147483647; width: 16px; height: 16px; margin: -8px; border: 1px solid rgba(238,118,82,.8); border-radius: 50%; pointer-events: none; background: rgba(251,233,226,.95); animation: ideaPlanetOrb 1450ms cubic-bezier(.2,.7,.2,1) forwards; }
      .idea-planet-orb.bookmark { border-color: rgba(114,155,179,.75); background: rgba(228,238,244,.9); }
      @keyframes ideaPlanetRipple { 0% { opacity:.8; transform:scale(.5); } 100% { opacity:0; transform:scale(3.2); } }
      @keyframes ideaPlanetOrb { 0% { opacity:0; transform:translateY(4px) scale(.65); } 15% { opacity:.95; transform:translateY(-2px) scale(1); } 58% { opacity:.9; transform:translateY(-8px) scale(1); } 100% { opacity:0; transform:translateY(-27px) scale(.76); } }
    `;
    document.documentElement.appendChild(style);
  };

  const showFlight = (event, kind) => {
    addEffectStyles();
    const x = event.clientX || window.innerWidth / 2;
    const y = event.clientY || window.innerHeight / 2;
    const ripple = document.createElement('span');
    ripple.className = `idea-planet-ripple ${kind}`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    document.body.appendChild(ripple);
    const orb = document.createElement('span');
    orb.className = `idea-planet-orb ${kind}`;
    orb.style.left = `${x}px`;
    orb.style.top = `${y}px`;
    document.body.appendChild(orb);
    setTimeout(() => { ripple.remove(); orb.remove(); }, 1550);
  };

  const observeNativeAction = (button, article) => {
    if (button.hasAttribute(observed)) return;
    const kind = actionKind(button);
    if (!kind) return;
    button.setAttribute(observed, '1');
    button.addEventListener('click', event => {
      const currentKind = actionKind(button);
      if (!currentKind) return;
      const url = statusUrlFor(article);
      const point = { clientX: event.clientX, clientY: event.clientY };
      // X updates the button and sometimes the article asynchronously. Read after that settles.
      setTimeout(async () => {
        try {
          const expanded = await expandBeforeCapture(article, url);
          await send(captureArticle(expanded, currentKind));
          showFlight(point, currentKind);
        } catch (error) {
          addEffectStyles();
          const notice = document.createElement('div');
          notice.className = 'idea-planet-notice';
          notice.textContent = error.message;
          document.body.appendChild(notice);
          setTimeout(() => notice.remove(), 4000);
        }
      }, 100);
    });
  };

  const authoredAction = button => {
    const label = labelFor(button);
    const testId = (button.getAttribute('data-testid') || '').toLowerCase();
    // Reply/Comment opens the composer; tweetButton/Post submits it.
    if (/tweetbutton|postbutton/.test(testId)) return true;
    return /^(post|发布|发送|发帖|评论|回复)$/.test((button.innerText || button.getAttribute('aria-label') || '').trim()) && !/reply|回复$/.test(label);
  };
  const captureNewestAuthored = (before, kindHint = '') => {
    setTimeout(async () => {
      const article = [...document.querySelectorAll('article')].reverse().find(item => !before.has(item)) || document.querySelector('article');
      if (!article) return;
      const reply = kindHint === 'reply' || /replying to|回复/.test((article.innerText || '').toLowerCase());
      try { await send(captureArticle(await expandBeforeCapture(article, statusUrlFor(article)), reply ? 'reply' : 'authored')); } catch { /* the next explicit action can retry */ }
    }, 900);
  };
  const observeAuthoredAction = button => {
    if (button.hasAttribute('data-idea-planet-authored')) return;
    if (!authoredAction(button)) return;
    button.setAttribute('data-idea-planet-authored', '1');
    button.addEventListener('click', () => {
      const before = new Set([...document.querySelectorAll('article')]);
      captureNewestAuthored(before);
    });
  };

  const scan = () => {
    document.querySelectorAll('article').forEach(article => {
      article.querySelectorAll('button, [role="button"]').forEach(button => observeNativeAction(button, article));
    });
    // Composer submit buttons live outside the article that opened the composer.
    document.querySelectorAll('button, [role="button"]').forEach(observeAuthoredAction);
  };

  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();

  // X supports Cmd+Enter on macOS and Ctrl+Enter on Windows/Linux. This
  // submit path does not reliably emit a click on the Post button.
  document.addEventListener('keydown', event => {
    if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return;
    const target = event.target;
    if (!target?.closest?.('[contenteditable="true"], textarea, [data-testid*="tweetTextarea"]')) return;
    const before = new Set([...document.querySelectorAll('article')]);
    const context = target.closest('[role="dialog"]')?.innerText || target.closest('form')?.innerText || '';
    captureNewestAuthored(before, /replying to|回复/.test(context.toLowerCase()) ? 'reply' : '');
  }, true);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'captureCurrent') return;
    const article = articleForUrl(location.href) || document.querySelector('article');
    if (!article) {
      sendResponse({ ok: false });
      return;
    }
    const kind = activeKindFor(article);
    const url = statusUrlFor(article);
    expandBeforeCapture(article, url).then(async expanded => {
      await send(captureArticle(expanded, kind));
      sendResponse({ ok: true });
    }).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  });
})();
