let alive = true;
let timer = null;

const stop = () => {
  alive = false;
  if (timer !== null) window.clearInterval(timer);
  timer = null;
};

const drain = () => {
  if (!alive || !chrome?.runtime?.id) return stop();
  try {
    chrome.runtime.sendMessage({ type: 'drain' }, response => {
      try {
        // lastError is expected when the extension was reloaded or removed.
        if (chrome.runtime.lastError) return stop();
        if (!response?.queue?.length) return;
        window.postMessage({ source: 'idea-planet-extension', type: 'IMPORT', payload: response.queue }, location.origin);
      } catch {
        stop();
      }
    });
  } catch {
    // The old content script can survive an extension reload briefly.
    stop();
  }
};

drain();
timer = window.setInterval(drain, 2500);
