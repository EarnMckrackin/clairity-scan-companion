import {
  extractImageDimensions,
  fileMetadata,
  getSettings,
  readableType,
  runScan,
  saveScan
} from './clairity-store.js';

const state = {
  source: 'url',
  currentResult: null,
  selectedFile: null
};

const els = {
  scanForm: document.querySelector('#scanForm'),
  textForm: document.querySelector('#textForm'),
  fileForm: document.querySelector('#fileForm'),
  urlInput: document.querySelector('#scanInput'),
  textInput: document.querySelector('#textInput'),
  fileInput: document.querySelector('#fileInput'),
  fileName: document.querySelector('#fileName'),
  message: document.querySelector('#scanMessage'),
  score: document.querySelector('#scoreValue'),
  status: document.querySelector('#statusTitle'),
  badge: document.querySelector('#statusBadge'),
  summary: document.querySelector('#plainSummary'),
  detailTitle: document.querySelector('#detailTitle'),
  detailCopy: document.querySelector('#detailCopy'),
  detailSignals: document.querySelector('#detailSignals'),
  preview: document.querySelector('#mediaPreview'),
  textLines: document.querySelector('#textLines'),
  copy: document.querySelector('#copySummary'),
  save: document.querySelector('#saveResult'),
  search: document.querySelector('#trustedSearch')
};

function setBusy(isBusy, label = 'Scanning...') {
  document.querySelectorAll('[data-scan-submit]').forEach((button) => {
    button.disabled = isBusy;
    button.textContent = isBusy ? label : button.dataset.idleLabel;
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function toneClass(tone) {
  if (tone === 'ok') return 'ok';
  if (tone === 'concern') return 'concern';
  return '';
}

function setPreview(type) {
  els.preview.className = `media-preview ${type === 'url' ? '' : type}`;
  els.textLines.classList.toggle('notice-hidden', type !== 'text');
}

function renderResult(result, { autosaved = false } = {}) {
  state.currentResult = result;
  els.score.textContent = result.score;
  els.status.textContent = result.status;
  els.badge.textContent = `${result.evidence.length} clue${result.evidence.length === 1 ? '' : 's'}`;
  els.badge.className = `status-badge ${toneClass(result.tone)}`;
  els.summary.textContent = result.summary;
  els.detailTitle.textContent = result.label || `${readableType(result.type)} scan`;
  els.detailCopy.textContent = result.nextStep;
  setPreview(result.type);

  els.detailSignals.innerHTML = result.evidence.map((item, index) => `
    <div class="timeline-step">
      <span class="signal-dot">${index + 1}</span>
      <span>${escapeHtml(item.label)}<small>${escapeHtml(item.detail || '')}</small></span>
      <span class="mini-score">${escapeHtml(item.weight)}</span>
    </div>
  `).join('');

  els.message.textContent = autosaved
    ? 'Scan complete · saved on this device'
    : 'Scan complete · result shown only in this browser';
}

async function scan(payload) {
  setBusy(true);
  els.message.textContent = 'Scanning without saving raw media...';
  try {
    const result = await runScan(payload);
    result.sourcePreview = payload.url || payload.content || payload.media?.name || '';
    const settings = getSettings();
    if (settings.saveSummaries) {
      await saveScan(result);
      renderResult(result, { autosaved: true });
    } else {
      renderResult(result);
    }
  } catch (error) {
    els.message.textContent = error.message || 'Scan failed. Try again.';
  } finally {
    setBusy(false);
  }
}

document.querySelectorAll('[data-source]').forEach((button) => {
  button.addEventListener('click', () => {
    state.source = button.dataset.source;
    document.querySelectorAll('[data-source]').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    document.querySelectorAll('[data-panel]').forEach((panel) => {
      panel.classList.toggle('notice-hidden', panel.dataset.panel !== state.source);
    });
    els.message.textContent = state.source === 'upload'
      ? 'Ready to scan file metadata privately'
      : state.source === 'text'
        ? 'Ready to scan pasted text'
        : 'Ready to scan a webpage or post';
  });
});

document.querySelectorAll('[data-type]').forEach((button) => {
  button.addEventListener('click', () => {
    setPreview(button.dataset.type);
    document.querySelectorAll('[data-type]').forEach((item) => item.classList.toggle('active', item === button));
  });
});

els.scanForm.addEventListener('submit', (event) => {
  event.preventDefault();
  scan({ type: 'url', url: els.urlInput.value.trim(), content: els.urlInput.value.trim() });
});

els.textForm.addEventListener('submit', (event) => {
  event.preventDefault();
  scan({ type: 'text', content: els.textInput.value.trim() });
});

els.fileInput.addEventListener('change', () => {
  state.selectedFile = els.fileInput.files?.[0] || null;
  els.fileName.textContent = state.selectedFile
    ? `${state.selectedFile.name} · ${Math.ceil(state.selectedFile.size / 1024)} KB`
    : 'No file selected';
});

els.fileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.selectedFile) {
    els.message.textContent = 'Choose a file first.';
    return;
  }
  setBusy(true, 'Reading...');
  const dimensions = await extractImageDimensions(state.selectedFile).catch(() => ({}));
  const metadata = fileMetadata(state.selectedFile, dimensions);
  const type = metadata.type.startsWith('audio/')
    ? 'audio'
    : metadata.type.startsWith('video/')
      ? 'video'
      : 'image';
  setBusy(false);
  scan({ type, media: metadata });
});

els.copy.addEventListener('click', async () => {
  if (!state.currentResult) return;
  await navigator.clipboard?.writeText(`clAIrity says: ${state.currentResult.status}. ${state.currentResult.summary} Next: ${state.currentResult.nextStep}`);
  els.copy.textContent = 'Summary copied';
  setTimeout(() => {
    els.copy.textContent = 'Copy simple summary';
  }, 1600);
});

els.save.addEventListener('click', async () => {
  if (!state.currentResult) {
    els.message.textContent = 'Run a scan first.';
    return;
  }
  await saveScan(state.currentResult);
  els.message.textContent = 'Saved to history on this device';
});

els.search.addEventListener('click', () => {
  const query = encodeURIComponent(state.currentResult?.label || els.urlInput.value || 'trusted source check');
  window.open(`https://www.google.com/search?q=${query}`, '_blank', 'noopener,noreferrer');
});
