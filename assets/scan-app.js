import {
  captureScreenImage,
  detectMedia,
  extractImageDimensions,
  extractImageStats,
  fileMetadata,
  getDetectorConfig,
  getSettings,
  readableType,
  runScan,
  saveScan
} from './clairity-store.js';
import { inspectProvenance, provenanceApplies } from './clairity-c2pa.js';
import { verdictFromProvenance, contextOnlyVerdict, applyDetector } from './clairity-verdict.js';

// The verdict is what the person actually reads. For files it comes from the
// Content Credentials check (the only reliable signal); for links and text we
// stay in honest "context only" mode and never imply AI detection.
function computeVerdict(payload, extras = {}) {
  if (payload.type === 'url') return contextOnlyVerdict('url');
  if (payload.type === 'text') return contextOnlyVerdict('text');
  return verdictFromProvenance(extras.provenance, {
    mediaType: payload.type,
    screenCapture: Boolean(extras.screenCapture)
  });
}

const state = {
  source: 'url',
  currentResult: null,
  selectedFile: null,
  detector: { configured: false, provider: '' }
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
  scoreCaption: document.querySelector('#scoreCaption'),
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
  search: document.querySelector('#trustedSearch'),
  detector: document.querySelector('#runDetector'),
  detectorHelp: document.querySelector('#detectorHelp')
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
  if (tone === 'care') return 'care';
  if (tone === 'concern') return 'concern';
  return '';
}

function setPreview(type) {
  els.preview.className = `media-preview ${type === 'url' ? '' : type}`;
  els.textLines.classList.toggle('notice-hidden', type !== 'text');
}

function fallbackVerdict(result) {
  return {
    state: 'unproven',
    icon: '?',
    tone: 'care',
    title: result.status || 'Could not confirm origin',
    badge: '',
    plain: result.summary || '',
    detail: ''
  };
}

function renderReport(result) {
  const verdict = result.verdict || fallbackVerdict(result);
  const sections = result.metadata?.reportSections || [];
  const checks = result.checks || [];

  // The verdict card carries the only claim we stand behind.
  const verdictMarkup = `
    <article class="check-card verdict-card ${toneClass(verdict.tone)}" data-verdict="${escapeHtml(verdict.state)}">
      <span class="check-label">${escapeHtml(verdict.badge || 'Result')}</span>
      <strong>${escapeHtml(verdict.title)}</strong>
      <p>${escapeHtml(verdict.plain || '')}</p>
      ${verdict.detail ? `<p class="check-detail">${escapeHtml(verdict.detail)}</p>` : ''}
    </article>
  `;

  const checkMarkup = checks.map((item) => `
    <article class="check-card ${toneClass(item.tone)}">
      <span class="check-label">${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.status)}</strong>
      <p>${escapeHtml(item.detail || '')}</p>
    </article>
  `).join('');
  const sectionMarkup = sections.map((section) => `
    <div class="report-section">
      <strong>${escapeHtml(section.title)}</strong>
      <p>${escapeHtml(section.detail)}</p>
    </div>
  `).join('');
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

  // Everything below the verdict is supporting context, not AI detection.
  const contextDivider = (checkMarkup || sectionMarkup || evidenceMarkup)
    ? '<p class="context-divider">Other context — source &amp; sharing-pressure clues, not AI detection</p>'
    : '';

  els.detailSignals.innerHTML = `${verdictMarkup}${contextDivider}${checkMarkup ? `<div class="check-grid">${checkMarkup}</div>` : ''}${sectionMarkup}${evidenceMarkup}`;
}

function renderResult(result, { autosaved = false } = {}) {
  state.currentResult = result;
  const verdict = result.verdict || fallbackVerdict(result);

  els.score.textContent = verdict.icon;
  const orb = els.score.closest('.score-orb');
  if (orb) orb.dataset.verdict = verdict.state;
  if (els.scoreCaption) {
    els.scoreCaption.textContent = verdict.badge || '';
  }
  els.status.textContent = verdict.title;
  els.badge.textContent = verdict.badge || '';
  els.badge.className = `status-badge ${toneClass(verdict.tone)}`;
  els.summary.textContent = verdict.plain || result.summary;
  els.detailTitle.textContent = result.label || `${readableType(result.type)} scan`;
  els.detailCopy.textContent = result.nextStep;
  setPreview(result.type);
  renderReport(result);
  setResultActionsEnabled(true);
  offerDetector(result);

  els.message.textContent = autosaved
    ? 'Check complete. Saved on this device.'
    : 'Check complete. Kept in this browser.';
}

// The detector uploads the file to a third party, so it is offered only when:
// the server has it configured, C2PA could not confirm the origin, and we still
// hold the original file. The button label is itself the consent disclosure.
function offerDetector(result) {
  if (!els.detector) return;
  const eligible = state.detector.configured
    && ['image', 'video', 'audio'].includes(result.type)
    && result.verdict?.state === 'unproven'
    && state.selectedFile instanceof File
    && !result.detector;
  els.detector.classList.toggle('notice-hidden', !eligible);
  els.detectorHelp?.classList.toggle('notice-hidden', !eligible);
  if (eligible && els.detectorHelp) {
    els.detectorHelp.textContent = `Optional second opinion: this sends the file to ${state.detector.provider || 'an AI detector'} and leaves your device for that one check.`;
  }
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

async function scan(payload, extras = {}) {
  setBusy(true);
  setResultActionsEnabled(false);
  els.message.textContent = 'Checking without storing raw media...';
  try {
    const result = await runScan(payload);
    result.sourcePreview = payload.url || payload.content || payload.media?.name || '';
    result.provenance = extras.provenance || null;
    result.verdict = computeVerdict(payload, extras);
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
    // The real check: read Content Credentials from the raw file, in the browser.
    let provenance = { status: 'unknown', reason: 'unsupported' };
    if (provenanceApplies(state.selectedFile)) {
      els.message.textContent = 'Checking Content Credentials on this device...';
      provenance = await inspectProvenance(state.selectedFile).catch(() => ({ status: 'unknown', reason: 'read-failed' }));
    }
    await scan({ type, media: metadata }, { provenance });
  } finally {
    setBusy(false);
  }
});

els.screenCapture?.addEventListener('click', async () => {
  setBusy(true, 'Capturing...');
  els.message.textContent = 'Choose the tab, window, or screen area that contains the image.';
  try {
    const media = await captureScreenImage();
    // Screen captures are re-encoded images: any original Content Credentials
    // are stripped, so we say so plainly instead of guessing.
    await scan({ type: 'image', media }, { screenCapture: true });
  } catch (error) {
    els.message.textContent = error.message || 'Screen capture was cancelled.';
  } finally {
    setBusy(false);
  }
});

els.copy.addEventListener('click', async () => {
  if (!state.currentResult) return;
  const verdict = state.currentResult.verdict || fallbackVerdict(state.currentResult);
  const keyChecks = (state.currentResult.checks || []).slice(0, 3).map((item) => `${item.label}: ${item.status}`).join('; ');
  const text = `Verax check — ${verdict.title}: ${verdict.plain} Other context: ${keyChecks}. Next step: ${state.currentResult.nextStep}`;
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

els.detector?.addEventListener('click', async () => {
  if (!(state.selectedFile instanceof File) || !state.currentResult) return;
  const provider = state.detector.provider || 'the AI detector';
  els.detector.disabled = true;
  els.message.textContent = `Sending file to ${provider} for a second opinion...`;
  try {
    const detector = await detectMedia(state.selectedFile);
    if (!detector.available) {
      els.message.textContent = {
        'not-configured': 'The AI detector is not set up on this server.',
        'unsupported-type': 'The AI detector does not support this file type.',
        'too-large': 'This file is too large for the AI detector.',
        'pending': 'The AI detector is still processing this file. Try the check again in a moment.'
      }[detector.reason] || 'The AI detector could not check this file.';
      return;
    }
    const result = state.currentResult;
    result.detector = detector;
    result.verdict = applyDetector(result.verdict, detector, { mediaType: result.type });
    const settings = getSettings();
    if (settings.saveSummaries) await saveScan(result);
    renderResult(result, { autosaved: settings.saveSummaries });
    els.message.textContent = `Second opinion from ${provider} added.`;
  } catch (error) {
    els.message.textContent = error.message || 'AI detector check failed.';
  } finally {
    els.detector.disabled = false;
  }
});

// Probe detector availability once so the opt-in button only appears when usable.
getDetectorConfig().then((config) => {
  state.detector = { configured: Boolean(config.configured), provider: config.provider || '' };
  if (state.currentResult) offerDetector(state.currentResult);
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
