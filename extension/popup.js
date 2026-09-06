document.querySelector('#capture').addEventListener('click', async () => {
  const status = document.querySelector('#status');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'captureCurrent' });
    status.textContent = response?.ok ? '已保存当前帖子' : response?.error || '请在 X 帖子页面使用';
  } catch { status.textContent = '请在 X 页面使用'; }
});
