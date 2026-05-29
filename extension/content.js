// Verax Surf Guard content script.
//
// Detection is now grounded in Content Credentials (C2PA), read from the actual
// media bytes by the extension's offscreen WebAssembly worker — not in keyword
// guesses about alt text or filenames. Each visible image/video gets an honest
// badge: Verified origin, Made with AI, Be careful (tampered), or Not confirmed.

const WEB_APP_BASE = 'https://clairity-scan-companion.vercel.app';

let clairityEnabled = true;
let showBadges = true;
let simpleMode = true;
const badgeMap = new WeakMap();
const provenanceCache = new Map(); // src -> provenance result
const inflight = new Map(); // src -> Promise

function mediaSource(element) {
  if (element.currentSrc) return element.currentSrc;
  if (element.src) return element.src;
  const source = element.querySelector?.('source[src]');
  return source?.src || '';
}

function isCheckable(src) {
  return /^https?:|^data:|^blob:/i.test(src || '');
}

async function requestProvenance(src) {
  if (provenanceCache.has(src)) return provenanceCache.get(src);
  if (inflight.has(src)) return inflight.get(src);
  const promise = chrome.runtime
    .sendMessage({ type: 'VERAX_PROVENANCE', url: src })
    .then((result) => {
      const value = result || { status: 'unknown' };
      provenanceCache.set(src, value);
      inflight.delete(src);
      return value;
    })
    .catch(() => {
      const value = { status: 'unknown', reason: 'message-failed' };
      provenanceCache.set(src, value);
      inflight.delete(src);
      return value;
    });
  inflight.set(src, promise);
  return promise;
}

function badgeText(verdict) {
  if (!verdict) return simpleMode ? 'Checking…' : 'Verax checking';
  const map = {
    verified: simpleMode ? 'Verified' : 'Verified origin',
    ai: simpleMode ? 'Made with AI' : 'AI credentials',
    altered: simpleMode ? 'Be careful' : 'Tampered credentials',
    unproven: simpleMode ? 'Not confirmed' : 'No credentials'
  };
  return `Verax ${map[verdict.state] || 'Not confirmed'}`;
}

function visibleMedia() {
  return [...document.querySelectorAll('img, video')].filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width >= 96 && rect.height >= 96 && rect.bottom >= 0 && rect.right >= 0;
  });
}

function placeBadge(element, badge) {
  const rect = element.getBoundingClientRect();
  badge.style.top = `${Math.max(6, rect.top + window.scrollY + 8)}px`;
  badge.style.left = `${Math.max(6, rect.left + window.scrollX + 8)}px`;
}

function inspect(element, provenance) {
  const src = mediaSource(element);
  const isVideo = element.tagName.toLowerCase() === 'video';
  const verdict = provenance ? self.VeraxVerdict.fromProvenance(provenance, { isVideo }) : null;
  return {
    src,
    tag: element.tagName.toLowerCase(),
    isVideo,
    width: element.naturalWidth || element.videoWidth || element.clientWidth,
    height: element.naturalHeight || element.videoHeight || element.clientHeight,
    provenance,
    verdict
  };
}

function styleBadge(badge, verdict) {
  badge.dataset.level = verdict ? verdict.tone : 'checking';
  badge.textContent = badgeText(verdict);
}

function renderBadges() {
  document.querySelectorAll('.clairity-badge').forEach((badge) => badge.remove());

  if (!clairityEnabled || !showBadges) return;

  visibleMedia().forEach((element) => {
    const src = mediaSource(element);
    const badge = document.createElement('button');
    badge.className = 'clairity-badge';
    badge.type = 'button';
    styleBadge(badge, provenanceCache.get(src) ? self.VeraxVerdict.fromProvenance(provenanceCache.get(src), { isVideo: element.tagName.toLowerCase() === 'video' }) : null);
    badge.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPanel(inspect(element, provenanceCache.get(src)));
    });
    document.body.append(badge);
    badgeMap.set(element, badge);
    placeBadge(element, badge);

    if (isCheckable(src)) {
      requestProvenance(src).then((provenance) => {
        if (badge.isConnected) styleBadge(badge, self.VeraxVerdict.fromProvenance(provenance, { isVideo: element.tagName.toLowerCase() === 'video' }));
      });
    } else {
      styleBadge(badge, self.VeraxVerdict.fromProvenance({ status: 'unknown' }, {}));
    }
  });
}

function googleLensUrl(src) {
  return `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(src)}`;
}

function tineyeUrl(src) {
  return `https://tineye.com/search?url=${encodeURIComponent(src)}`;
}

function escapePanelText(value) {
  const node = document.createElement('span');
  node.textContent = String(value);
  return node.innerHTML;
}

function openPanel(inspection) {
  document.querySelector('.clairity-panel')?.remove();
  const verdict = inspection.verdict || self.VeraxVerdict.fromProvenance({ status: 'unknown' }, { isVideo: inspection.isVideo });
  const prov = inspection.provenance || {};
  const credentialFacts = [
    prov.generator && `Made with: ${prov.generator}`,
    prov.issuer && `Signed by: ${prov.issuer}`,
    prov.aiTool && `AI tool: ${prov.aiTool}`
  ].filter(Boolean);

  const panel = document.createElement('aside');
  panel.className = 'clairity-panel';
  panel.innerHTML = `
    <header>
      <div>
        <p class="clairity-kicker">Verax page check</p>
        <h2>${escapePanelText(verdict.title)}</h2>
      </div>
      <button class="clairity-close" type="button" aria-label="Close">X</button>
    </header>
    <section>
      <p class="clairity-kicker">What this means</p>
      <p>${escapePanelText(verdict.plain)}</p>
      ${simpleMode ? '<p>When in doubt, pause and ask someone you trust before sharing.</p>' : ''}
    </section>
    <section>
      <p class="clairity-kicker">Content Credentials</p>
      ${credentialFacts.length
        ? `<ul>${credentialFacts.map((fact) => `<li class="clairity-mono">${escapePanelText(fact)}</li>`).join('')}</ul>`
        : '<p>No Content Credentials were found in this file.</p>'}
      <ul>
        <li>Type: <span class="clairity-mono">${escapePanelText(inspection.tag)}</span></li>
        <li>Dimensions: <span class="clairity-mono">${inspection.width || 'unknown'} x ${inspection.height || 'unknown'}</span></li>
      </ul>
    </section>
    <section>
      <p class="clairity-kicker">What to do next</p>
      <ul>
        <li>${simpleMode ? 'See if a trusted news site or official account also posted it.' : 'Open the source account or publisher history.'}</li>
        <li>${simpleMode ? 'Use image search to see where it first appeared.' : 'Reverse-search the media URL.'}</li>
        <li>${simpleMode ? 'For a deeper AI check, open it in the full Verax app.' : 'Run a probabilistic AI/deepfake check in the Verax web app.'}</li>
      </ul>
      <div class="clairity-actions">
        <a href="${googleLensUrl(inspection.src)}" target="_blank" rel="noreferrer">Google Lens</a>
        <a href="${tineyeUrl(inspection.src)}" target="_blank" rel="noreferrer">TinEye</a>
        <a href="${WEB_APP_BASE}" target="_blank" rel="noreferrer">Open Verax</a>
      </div>
    </section>
  `;
  panel.querySelector('.clairity-close').addEventListener('click', () => panel.remove());
  document.body.append(panel);
}

function scanSummary() {
  const media = visibleMedia();
  let verified = 0;
  let flagged = 0;
  let unconfirmed = 0;
  media.forEach((element) => {
    const provenance = provenanceCache.get(mediaSource(element));
    const state = provenance ? self.VeraxVerdict.fromProvenance(provenance, {}).state : 'unproven';
    if (state === 'verified') verified += 1;
    else if (state === 'ai' || state === 'altered') flagged += 1;
    else unconfirmed += 1;
  });
  return { count: media.length, verified, flagged, unconfirmed };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CLAIRITY_SCAN') {
    renderBadges();
    sendResponse(scanSummary());
    return true;
  }

  if (message.type === 'CLAIRITY_TOGGLE') {
    clairityEnabled = message.enabled;
    showBadges = message.showBadges;
    simpleMode = message.simpleMode;
    renderBadges();
    sendResponse(scanSummary());
    return true;
  }

  if (message.type === 'CLAIRITY_CONTEXT_REVIEW') {
    const src = message.srcUrl;
    const match = visibleMedia().find((element) => mediaSource(element) === src);
    const open = (provenance) => openPanel(match
      ? inspect(match, provenance)
      : { src, tag: 'media', width: '', height: '', isVideo: false, provenance, verdict: self.VeraxVerdict.fromProvenance(provenance, {}) });
    if (isCheckable(src)) {
      requestProvenance(src).then(open);
    } else {
      open({ status: 'unknown' });
    }
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

chrome.storage.sync.get(['clairityEnabled', 'clairityShowBadges', 'clairitySimpleMode'], (values) => {
  clairityEnabled = values.clairityEnabled !== false;
  showBadges = values.clairityShowBadges !== false;
  simpleMode = values.clairitySimpleMode !== false;
  renderBadges();
});

let renderTimer = 0;
window.addEventListener('scroll', () => {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderBadges, 150);
});
window.addEventListener('resize', renderBadges);
