const DEFAULT_API_BASE = 'https://clairity-scan-companion.vercel.app';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'clairity-scan-selection',
    title: 'Scan selected text with clAIrity',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'clairity-scan-page',
    title: 'Scan this page with clAIrity',
    contexts: ['page']
  });
});

async function getApiBase() {
  const stored = await chrome.storage.local.get(['apiBase']);
  return (stored.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
}

async function scan(payload) {
  const apiBase = await getApiBase();
  const response = await fetch(`${apiBase}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Scan failed');
  const stored = await chrome.storage.local.get(['scanHistory']);
  const history = Array.isArray(stored.scanHistory) ? stored.scanHistory : [];
  await chrome.storage.local.set({
    lastScan: data.result,
    scanHistory: [data.result, ...history].slice(0, 50)
  });
  return data.result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'CLAIRITY_SCAN') return false;
  scan(message.payload)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  const payload = info.menuItemId === 'clairity-scan-selection'
    ? { type: 'text', content: info.selectionText || '' }
    : { type: 'url', url: tab.url, content: tab.url };
  try {
    const result = await scan(payload);
    await chrome.tabs.sendMessage(tab.id, { type: 'CLAIRITY_SHOW_OVERLAY', result });
  } catch (error) {
    await chrome.tabs.sendMessage(tab.id, { type: 'CLAIRITY_SHOW_ERROR', error: error.message });
  }
});
