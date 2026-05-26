const els = {
  state: document.querySelector('#state'),
  score: document.querySelector('#score'),
  status: document.querySelector('#status'),
  summary: document.querySelector('#summary'),
  scanPage: document.querySelector('#scanPage'),
  scanSelection: document.querySelector('#scanSelection'),
  apiBase: document.querySelector('#apiBase')
};

const hasChromeApi = typeof chrome !== 'undefined' && chrome.runtime && chrome.tabs && chrome.storage;

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function render(result) {
  els.score.textContent = result.score;
  els.status.textContent = result.status;
  els.summary.textContent = result.summary;
  els.state.textContent = 'Complete';
}

async function sendScan(payload) {
  els.state.textContent = 'Scanning...';
  const response = await chrome.runtime.sendMessage({ type: 'CLAIRITY_SCAN', payload });
  if (!response.ok) throw new Error(response.error);
  render(response.result);
  const tab = await activeTab();
  if (tab?.id) {
    await chrome.tabs.sendMessage(tab.id, { type: 'CLAIRITY_SHOW_OVERLAY', result: response.result }).catch(() => {});
  }
}

els.scanPage.addEventListener('click', async () => {
  if (!hasChromeApi) {
    render({
      score: 76,
      status: 'Use care',
      summary: 'Browser preview mode: install the extension folder to scan the active tab.'
    });
    return;
  }
  const tab = await activeTab();
  await sendScan({ type: 'url', url: tab.url, content: tab.url });
});

els.scanSelection.addEventListener('click', async () => {
  if (!hasChromeApi) {
    render({
      score: 61,
      status: 'Use care',
      summary: 'Browser preview mode: selected-text scanning works after the extension is installed.'
    });
    return;
  }
  const tab = await activeTab();
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.getSelection().toString()
  });
  await sendScan({ type: 'text', content: result || document.title || tab.url });
});

if (hasChromeApi) {
  chrome.storage.local.get(['lastScan', 'apiBase']).then((data) => {
    if (data.lastScan) render(data.lastScan);
    if (data.apiBase) els.apiBase.value = data.apiBase;
  });
} else {
  els.state.textContent = 'Preview';
}

els.apiBase.addEventListener('change', async () => {
  if (!hasChromeApi) {
    els.state.textContent = 'Preview only';
    return;
  }
  await chrome.storage.local.set({ apiBase: els.apiBase.value.trim().replace(/\/$/, '') });
  els.state.textContent = 'Saved';
});
