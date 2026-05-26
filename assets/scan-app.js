import {
  captureScreenImage,
  extractImageDimensions,
  extractImageStats,
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
  screenCapture: document.querySelector('#screenCapture'),
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
  resultActionsHelp: document.querySelector('#resultActionsHelp'),
  search: document.querySelector('#trustedSearch')
};

function setBusy(isBusy, label = 'Scanning...') {
  document.querySelectorAll('[data-scan-submit]').forEach((button) => {
    button.disabled = isBusy;
    button.textContent = isBusy ? label : button.dataset.idleLabel;
  });
}

function setResultActionsEnabled(enabled) {
  [els.copy, els.save].forEach((button) => {
    if (!button) return;
    button.textContent = button.dataset.readyLabel || button.textContent;
    button.disabled = !enabled;
    button.setAttribute(
      'aria-label',
      enabled
        ? button.dataset.readyLabel
        : `${button.dataset.readyLabel} unavailable until you check media`
    );
  });
  if (els.resultActionsHelp) {
    els.resultActionsHelp.textContent = enabled
      ? 'You can copy or save this check now.'
      : 'Check media first to unlock copy and save.';
  }
}

function setActionStatus(button, text, restoreAfter = 1400) {
  if (!button) return;
  const original = button.dataset.readyLabel || button.textContent;
  button.textContent = text;
  window.setTimeout(() => {
    button.textContent = original;
  }, restoreAfter);
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

function metricLabel(key) {
  return {
    sourceConfidence: 'Source confidence',
    contentRisk: 'Content anomaly',
    mediaRisk: 'Media anomaly',
    contextCompleteness: 'Context completeness',
    scanConfidence: 'Check coverage'
  }[key] || key;
}

function renderReport(result) {
  const sections = result.metadata?.reportSections || [];
  const metrics = result.metadata?.metrics || null;
  const sectionMarkup = sections.map((section) => `
    <div class="report-section">
      <strong>${escapeHtml(section.title)}</strong>
      <p>${escapeHtml(section.detail)}</p>
    </div>
  `).join('');
  const metricMarkup = metrics ? `
    <div class="metric-grid">
      ${Object.entries(metrics).map(([key, value]) => `
        <div class="metric">
          <span>${escapeHtml(metricLabel(key))}</span>
          <b>${escapeHtml(value)}</b>
        </div>
      `).join('')}
    </div>
  ` : '';
  const evidenceMarkup = result.evidence.map((item, index) => `
    <div class="timeline-step ${item.sentiment === 'supportive' ? 'supportive-step' : ''}">
      <span class="signal-dot">${index + 1}</span>
      <span>
        <em>${escapeHtml(item.category || 'Evidence')}</em>
        ${escapeHtml(item.label)}
        <small>${escapeHtml(item.detail || '')}</small>
      </span>
      <span class="mini-score">${escapeHtml(item.weight)}</span>
    </div>
  `).join('');

  els.detailSignals.innerHTML = `${metricMarkup}${sectionMarkup}${evidenceMarkup}`;
}

function renderResult(result, { autosaved = false } = {}) {
  state.currentResult = result;
  els.score.textContent = result.score;
  els.status.textContent = result.status;
  els.badge.textContent = `${result.evidence.length} signal${result.evidence.length === 1 ? '' : 's'}`;
  els.badge.className = `status-badge ${toneClass(result.tone)}`;
  els.summary.textContent = result.summary;
  els.detailTitle.textContent = result.label || `${readableType(result.type)} scan`;
  els.detailCopy.textContent = result.nextStep;
  setPreview(result.type);
  renderReport(result);
  setResultActionsEnabled(true);

  els.message.textContent = autosaved
    ? 'Check complete. Saved on this device.'
    : 'Check complete. Kept in this browser.';
}

function decodeAuditPayload() {
  const prefix = '#verax-audit=';
  if (!location.hash.startsWith(prefix)) return null;
  try {
    const encoded = decodeURIComponent(location.hash.slice(prefix.length));
    return JSON.parse(decodeURIComponent(escape(atob(encoded))));
  } catch {
    return null;
  }
}

function selectSource(source) {
  state.source = source;
  document.querySelectorAll('[data-source]').forEach((item) => {
    item.classList.toggle('active', item.dataset.source === source);
  });
  document.querySelectorAll('[data-panel]').forEach((panel) => {
    panel.classList.toggle('notice-hidden', panel.dataset.panel !== source);
  });
}

async function scan(payload) {
  setBusy(true);
  setResultActionsEnabled(false);
  els.message.textContent = 'Checking without storing raw media...';
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
    els.message.textContent = error.message || 'Check failed. Try again.';
  } finally {
    setBusy(false);
  }
}

document.querySelectorAll('[data-source]').forEach((button) => {
  button.addEventListener('click', () => {
    selectSource(button.dataset.source);
    els.message.textContent = state.source === 'upload'
      ? 'Ready to check a file privately'
      : state.source === 'text'
        ? 'Ready to check pasted text'
        : 'Ready to check a link or post';
  });
});

document.querySelectorAll('[data-sample]').forEach((button) => {
  button.addEventListener('click', () => {
    selectSource(button.dataset.sample);
    els.urlInput.focus();
    els.message.textContent = `Example: ${button.textContent}. Paste your own link to check it.`;
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
    els.message.textContent = 'Select an asset first.';
    return;
  }
  setBusy(true, 'Reading...');
  try {
    const dimensions = await extractImageDimensions(state.selectedFile).catch(() => ({}));
    const visualStats = await extractImageStats(state.selectedFile).catch(() => ({}));
    const metadata = fileMetadata(state.selectedFile, {
      ...dimensions,
      visualStats
    });
    const type = metadata.type.startsWith('audio/')
      ? 'audio'
      : metadata.type.startsWith('video/')
        ? 'video'
        : 'image';
    await scan({ type, media: metadata });
  } finally {
    setBusy(false);
  }
});

els.screenCapture?.addEventListener('click', async () => {
  setBusy(true, 'Capturing...');
  els.message.textContent = 'Choose the tab, window, or screen area that contains the image.';
  try {
    const media = await captureScreenImage();
    await scan({ type: 'image', media });
  } catch (error) {
    els.message.textContent = error.message || 'Screen capture was cancelled.';
  } finally {
    setBusy(false);
  }
});

els.copy.addEventListener('click', async () => {
  if (!state.currentResult) return;
  const text = `Verax check: ${state.currentResult.status}. ${state.currentResult.summary} Next step: ${state.currentResult.nextStep}`;
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error('Clipboard unavailable');
    }
    await navigator.clipboard.writeText(text);
    els.message.textContent = 'Result copied to clipboard.';
    setActionStatus(els.copy, 'Copied');
  } catch {
    els.message.textContent = 'Copy failed. Try again.';
  }
});

els.save.addEventListener('click', async () => {
  if (!state.currentResult) {
    els.message.textContent = 'Check media first.';
    return;
  }
  await saveScan(state.currentResult);
  els.message.textContent = 'Check saved on this device.';
  setActionStatus(els.save, 'Saved');
});

els.search.addEventListener('click', () => {
  const query = encodeURIComponent(state.currentResult?.label || els.urlInput.value || 'media check');
  window.open(`https://www.google.com/search?q=${query}`, '_blank', 'noopener,noreferrer');
});

const auditPayload = decodeAuditPayload();
if (auditPayload) {
  if (auditPayload.type === 'text') {
    selectSource('text');
    els.textInput.value = auditPayload.content || '';
  } else if (auditPayload.media || ['image', 'video', 'audio'].includes(auditPayload.type)) {
    selectSource('upload');
    els.fileName.textContent = auditPayload.media?.name || 'Captured screen image';
  } else {
    selectSource('url');
    els.urlInput.value = auditPayload.url || auditPayload.content || '';
  }
  history.replaceState(null, '', location.pathname + location.search);
  scan(auditPayload);
}

setResultActionsEnabled(false);
