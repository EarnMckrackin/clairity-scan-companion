(function () {
  if (window.__clairityFloating) {
    window.__clairityFloating.open();
    return;
  }

  const currentScript = document.currentScript;
  const origin = currentScript?.dataset?.clairityOrigin || window.__clairityOrigin || 'https://clairity-scan-companion.vercel.app';
  const root = document.createElement('aside');
  const logo = `
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="28" fill="#101820"/>
      <path d="M32 9l7.8 15.6L56 32l-16.2 7.4L32 55l-7.8-15.6L8 32l16.2-7.4L32 9z" fill="#f1c45b"/>
      <circle cx="32" cy="32" r="8" fill="#f8fbfc"/>
      <path d="M32 18v28M18 32h28" stroke="#101820" stroke-width="3" stroke-linecap="round"/>
    </svg>
  `;
  const state = {
    dragging: false,
    startX: 0,
    startY: 0,
    x: 18,
    y: 18
  };

  root.id = 'clairity-floating-companion';
  root.innerHTML = `
    <div class="clairity-float-head" data-drag-handle>
      <strong>${logo}<span>VERAX</span></strong>
      <button type="button" data-close aria-label="Close Verax">×</button>
    </div>
    <div class="clairity-float-score">
      <b data-score>--</b>
      <div>
        <h2 data-status>Ready</h2>
        <p data-summary>Check this page, selected text, or the page URL while you browse.</p>
      </div>
    </div>
    <div class="clairity-float-actions">
      <button type="button" data-scan-page>Check page text</button>
      <button type="button" data-scan-selection>Check selection</button>
      <button type="button" data-scan-url>Check URL</button>
      <button type="button" data-capture-screen>Check screen capture</button>
    </div>
    <div class="clairity-float-evidence" data-evidence></div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #clairity-floating-companion {
      position: fixed;
      right: 18px;
      top: 18px;
      z-index: 2147483647;
      width: min(380px, calc(100vw - 24px));
      max-height: min(680px, calc(100vh - 24px));
      overflow: auto;
      border: 1px solid #dbe5ea;
      border-radius: 14px;
      background: rgba(246,250,252,.98);
      color: #101820;
      box-shadow: 0 24px 80px rgba(2,7,11,.26);
      font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 14px;
      box-sizing: border-box;
    }
    #clairity-floating-companion * { box-sizing: border-box; }
    #clairity-floating-companion .clairity-float-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      cursor: grab;
      user-select: none;
      margin-bottom: 12px;
    }
    #clairity-floating-companion strong {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      font-size: 18px;
      letter-spacing: .14em;
    }
    #clairity-floating-companion strong svg {
      width: 28px;
      height: 28px;
      flex: 0 0 auto;
      filter: drop-shadow(0 6px 12px rgba(229,170,0,.22));
    }

    #clairity-floating-companion [data-close] {
      width: 34px;
      height: 34px;
      border: 1px solid #dbe5ea;
      border-radius: 999px;
      background: white;
      color: #17212b;
      font-size: 22px;
      cursor: pointer;
    }
    #clairity-floating-companion .clairity-float-score {
      display: grid;
      grid-template-columns: 86px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
    }
    #clairity-floating-companion [data-score] {
      display: grid;
      width: 86px;
      aspect-ratio: 1;
      place-items: center;
      border-radius: 50%;
      background: radial-gradient(circle, white 0 58%, transparent 59%), conic-gradient(#e5aa00 0 72%, #ecebdc 72% 100%);
      font-size: 32px;
      letter-spacing: -.04em;
    }
    #clairity-floating-companion h2 { margin: 0; font-size: 20px; }
    #clairity-floating-companion p { margin: 5px 0 0; color: #64748b; }
    #clairity-floating-companion .clairity-float-actions {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      margin: 14px 0;
    }
    #clairity-floating-companion .clairity-float-actions button {
      min-height: 40px;
      border: 0;
      border-radius: 8px;
      background: linear-gradient(135deg, #101820, #2d4655);
      color: white;
      font-weight: 800;
      cursor: pointer;
    }
    #clairity-floating-companion .clairity-float-evidence {
      display: grid;
      gap: 8px;
    }
    #clairity-floating-companion .clairity-float-evidence div {
      border-top: 1px solid #e5edf1;
      padding-top: 8px;
      color: #334155;
    }
    @media (max-width: 520px) {
      #clairity-floating-companion {
        inset: auto 10px 10px 10px;
        width: auto;
        max-height: min(74vh, 620px);
      }
      #clairity-floating-companion .clairity-float-score {
        grid-template-columns: 72px minmax(0, 1fr);
      }
      #clairity-floating-companion [data-score] {
        width: 72px;
        font-size: 26px;
      }
    }
  `;

  function pageSnippet() {
    const selected = window.getSelection().toString().trim();
    if (selected) return selected.slice(0, 8000);
    const article = document.querySelector('article')?.innerText || '';
    const body = document.body?.innerText || '';
    return [document.title, location.href, article || body].filter(Boolean).join('\\n\\n').slice(0, 10000);
  }

  function meta(selector) {
    return document.querySelector(selector)?.getAttribute('content') || '';
  }

  function pageSnapshot() {
    const canonical = document.querySelector('link[rel="canonical"]')?.href || location.href;
    const article = document.querySelector('article')?.innerText || '';
    const main = document.querySelector('main')?.innerText || '';
    const body = document.body?.innerText || '';
    const text = (article || main || body || '').replace(/\s+/g, ' ').trim().slice(0, 24000);
    const headings = [...document.querySelectorAll('h1, h2, h3')]
      .map((item) => item.innerText.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 14);
    const links = [...document.querySelectorAll('a[href]')]
      .map((item) => item.href)
      .filter(Boolean)
      .slice(0, 160);
    const images = [...document.querySelectorAll('img')]
      .map((image) => ({
        src: image.currentSrc || image.src,
        alt: image.alt || '',
        width: image.naturalWidth || image.width || null,
        height: image.naturalHeight || image.height || null
      }))
      .filter((image) => image.src || image.alt)
      .slice(0, 80);

    return {
      source: 'floating-companion',
      url: location.href,
      title: document.title,
      description: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
      canonical,
      author: meta('meta[name="author"]') || meta('meta[property="article:author"]'),
      publishedTime: meta('meta[property="article:published_time"]') || meta('meta[name="date"]'),
      headings,
      links,
      images,
      videoCount: document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"]').length,
      codeCount: document.querySelectorAll('pre, code').length,
      text,
      wordCount: text.split(/\s+/).filter(Boolean).length
    };
  }

  function setBusy(label) {
    root.querySelector('[data-status]').textContent = 'Checking...';
    root.querySelector('[data-summary]').textContent = label;
  }

  function render(result) {
    root.querySelector('[data-score]').textContent = result.score;
    root.querySelector('[data-status]').textContent = result.status;
    root.querySelector('[data-summary]').textContent = result.summary;
    root.querySelector('[data-evidence]').innerHTML = result.evidence.map((item) => `
      <div><small>${escapeHtml(item.category || 'Evidence')}</small><br><b>${escapeHtml(item.label)}</b><br><span>${escapeHtml(item.detail || '')}</span></div>
    `).join('');
  }

  function renderError(error) {
    root.querySelector('[data-score]').textContent = '!';
    root.querySelector('[data-status]').textContent = 'Could not check';
    root.querySelector('[data-summary]').textContent = error.message || 'Try again from the web app.';
  }

  function lower(value) {
    return String(value || '').toLowerCase();
  }

  function clampScore(score) {
    return Math.max(8, Math.min(96, Math.round(score)));
  }

  function statusFromScore(score) {
    if (score >= 78) return { label: 'High anomaly', tone: 'concern' };
    if (score >= 50) return { label: 'Review required', tone: 'care' };
    return { label: 'Low anomaly', tone: 'ok' };
  }

  function evidence(category, label, weight, detail, sentiment = 'caution') {
    return { category, label, weight, detail, sentiment };
  }

  function summarizeSignals(signals) {
    if (!signals.length) {
      return 'Verax did not find strong warning signs. Still check the source before sharing.';
    }
    const top = signals.slice(0, 2).map((item) => item.label.toLowerCase()).join(' and ');
    return `Verax noticed ${top}. That does not prove AI editing, but it is worth checking before sharing.`;
  }

  function buildResult({ type, label, score, signals, nextStep, metadata = {} }) {
    const normalizedSignals = signals.length
      ? signals
      : [evidence('Evidence', 'No strong warning signs found', 'Low', 'Verax did not find strong concern signals in this check.', 'supportive')];
    const finalScore = clampScore(score);
    const status = statusFromScore(finalScore);

    return {
      id: `floating_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      type,
      label,
      score: finalScore,
      status: status.label,
      tone: status.tone,
      summary: summarizeSignals(normalizedSignals),
      evidence: normalizedSignals.slice(0, 6),
      nextStep,
      metadata,
      privacy: {
        storedServerSide: false,
        rawInputRetained: false
      }
    };
  }

  function detectUrgency(text) {
    return /(share|forward|send).{0,20}(now|fast|before|urgent)|urgent|breaking|they don't want you to know|before it disappears|act now/i.test(text);
  }

  function detectSourceLanguage(text) {
    return /(according to|reported by|source:|via |published|study|court|agency|official|press release|archive)/i.test(text);
  }

  function classifyHost(host) {
    const normalized = lower(host).replace(/^www\./, '');
    if (/w3schools\.com|developer\.mozilla\.org|docs\./.test(normalized)) return 'educational reference';
    if (/wikipedia\.org|britannica\.com|khanacademy\.org/.test(normalized)) return 'reference';
    if (/reddit\.com|x\.com|twitter\.com|tiktok\.com|instagram\.com|facebook\.com|threads\.net|youtube\.com/.test(normalized)) return 'social platform';
    if (/\.gov$|\.edu$/.test(normalized)) return 'institutional';
    if (/nytimes\.com|apnews\.com|reuters\.com|bbc\.com|npr\.org|theguardian\.com|washingtonpost\.com/.test(normalized)) return 'news';
    return 'general website';
  }

  function localAnalyzeText(payload) {
    const text = String(payload.content || '').trim();
    const signals = [];
    let score = 30;

    if (!text) {
      throw new Error('No text was available to check on this page.');
    }

    signals.push(evidence('Text', 'Text checked in your browser', 'Low', 'Verax checked the selected or visible text without sending the raw page anywhere.', 'supportive'));

    if (text.length < 80) {
      signals.push(evidence('Text', 'Very short text sample', 'Medium', 'Short samples can be harder to judge without more context.'));
      score += 12;
    }
    if (detectUrgency(text)) {
      signals.push(evidence('Text', 'Urgent sharing language', 'High', 'The text pushes for quick action or resharing, which is common in misleading posts.'));
      score += 18;
    }
    if (/[A-Z]{6,}/.test(text) || (text.match(/[A-Z]/g) || []).length / Math.max(1, text.length) > 0.18) {
      signals.push(evidence('Text', 'Shouty formatting', 'Medium', 'Heavy capitalization can be a sign that the post is trying to provoke a reaction.'));
      score += 8;
    }
    if (detectSourceLanguage(text)) {
      signals.push(evidence('Text', 'Source-style wording found', 'Low', 'The text includes language that points to a source, publication, or attribution.', 'supportive'));
      score -= 10;
    } else {
      signals.push(evidence('Text', 'No clear source language', 'Medium', 'The visible text does not clearly point to a source, reporter, or original publisher.'));
      score += 9;
    }

    return buildResult({
      type: 'text',
      label: 'Selected text',
      score,
      signals,
      nextStep: 'Look for the same claim on a trusted source before sharing it.',
      metadata: { sampleLength: text.length }
    });
  }

  function localAnalyzeUrl(payload) {
    const url = String(payload.url || location.href || '').trim();
    const snapshot = payload.pageSnapshot || null;
    const signals = [];
    let score = 28;

    if (!url) {
      throw new Error('No page URL was available to check.');
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('This page URL is not valid enough to check.');
    }

    const hostType = classifyHost(parsed.hostname);
    signals.push(evidence('Source', `Host looks like ${hostType}`, 'Low', `Verax recognized ${parsed.hostname} as ${hostType}.`, hostType === 'news' || hostType === 'reference' || hostType === 'institutional' ? 'supportive' : 'caution'));

    if (hostType === 'social platform') score += 14;
    if (hostType === 'news' || hostType === 'reference' || hostType === 'institutional') score -= 12;

    if (snapshot?.text) {
      signals.push(evidence('Page', 'Visible page text checked', 'Low', 'Verax checked the visible page text already loaded in your browser.', 'supportive'));
      if (detectUrgency(snapshot.text)) {
        signals.push(evidence('Page', 'Urgent claim language', 'High', 'The visible page text pushes urgency or fast sharing.'));
        score += 16;
      }
      if (detectSourceLanguage(snapshot.text)) {
        signals.push(evidence('Page', 'Source details mentioned', 'Low', 'The page text includes source-style details or attribution.', 'supportive'));
        score -= 8;
      }
      if ((snapshot.wordCount || 0) < 120) {
        signals.push(evidence('Page', 'Thin page context', 'Medium', 'There is not much readable text on the page, so context is limited.'));
        score += 8;
      }
      if ((snapshot.images || []).length > 0) {
        signals.push(evidence('Page', 'Page includes media', 'Low', 'The page already contains image clues you can compare against the text.'));
      }
    } else {
      signals.push(evidence('Page', 'URL-only check', 'Medium', 'Verax could only use the URL and page type here, not the visible text.'));
      score += 10;
    }

    return buildResult({
      type: 'url',
      label: parsed.hostname,
      score,
      signals,
      nextStep: hostType === 'social platform'
        ? 'Open the original account or find a trusted report before sharing this post.'
        : 'Compare this page with another trusted source before sharing it.',
      metadata: {
        url,
        hostType,
        pageSnapshot: snapshot ? {
          title: snapshot.title,
          wordCount: snapshot.wordCount,
          imageCount: (snapshot.images || []).length
        } : null
      }
    });
  }

  function localAnalyzeMedia(payload) {
    const media = payload.media || {};
    const visual = media.visualStats || {};
    const signals = [];
    let score = 34;

    signals.push(evidence('Media', 'Screen image checked locally', 'Low', 'Verax checked the captured image in your browser without uploading the raw pixels.', 'supportive'));

    if (media.width && media.height) {
      signals.push(evidence('Media', 'Readable dimensions found', 'Low', `The capture reports ${media.width} x ${media.height}px dimensions.`, 'supportive'));
      score -= 4;
    }

    if (typeof visual.edgeDensity === 'number' && typeof visual.smoothness === 'number') {
      if (visual.smoothness > 0.52 && visual.edgeDensity < 0.105 && visual.luminanceStd < 44) {
        signals.push(evidence('Media', 'Unusually smooth image texture', 'High', 'Large smooth areas with limited edge variation can appear in generated or heavily edited images.'));
        score += 18;
      } else if (visual.edgeDensity > 0.18 && visual.luminanceStd > 48) {
        signals.push(evidence('Media', 'Natural detail variation', 'Low', 'The image has varied edges and texture instead of a uniformly smooth surface.', 'supportive'));
        score -= 10;
      }

      if (visual.grayscaleRatio > 0.78 && visual.edgeDensity > 0.11) {
        signals.push(evidence('Media', 'Monochrome photo texture', 'Low', 'The image reads more like a photographed or scanned monochrome scene than a flat synthetic render.', 'supportive'));
        score -= 10;
      }

      if (visual.saturationMean > 0.36 && visual.highContrastDensity < 0.055) {
        signals.push(evidence('Media', 'Polished color profile', 'Medium', 'High color saturation with limited hard contrast can be a sign of heavy editing or generated media.'));
        score += 8;
      }
    }

    if (/screenshot|screen/i.test(media.name || '')) {
      signals.push(evidence('Media', 'Screenshot context', 'Medium', 'Screenshots often remove source and metadata, so origin checks still matter.'));
      score += 4;
    }

    return buildResult({
      type: 'image',
      label: media.name || 'Captured image',
      score,
      signals,
      nextStep: 'Look for the original post, file, or source before sharing this image.',
      metadata: {
        width: media.width,
        height: media.height,
        visualStats: visual
      }
    });
  }

  async function localRunScan(payload) {
    const type = lower(payload.type || '');
    if (type === 'image' || payload.media) return localAnalyzeMedia(payload);
    if (type === 'url' || payload.url) return localAnalyzeUrl(payload);
    return localAnalyzeText(payload);
  }

  function compactSnapshot(snapshot) {
    if (!snapshot) return null;
    return {
      ...snapshot,
      text: String(snapshot.text || '').slice(0, 4200),
      headings: (snapshot.headings || []).slice(0, 10),
      links: (snapshot.links || []).slice(0, 24),
      images: (snapshot.images || []).slice(0, 18).map((image) => ({
        src: image.src,
        alt: String(image.alt || '').slice(0, 120),
        width: image.width,
        height: image.height
      }))
    };
  }

  function compactPayload(payload) {
    const compact = {
      ...payload,
      content: String(payload.content || '').slice(0, 4200)
    };
    if (payload.pageSnapshot) compact.pageSnapshot = compactSnapshot(payload.pageSnapshot);
    return compact;
  }

  function encodePayload(payload) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(compactPayload(payload)))));
  }

  function openInApp(payload, targetWindow) {
    const url = `${origin}/screens/web-scan.html#verax-audit=${encodeURIComponent(encodePayload(payload))}`;
    if (targetWindow && !targetWindow.closed) {
      targetWindow.location.href = url;
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function renderOpenedInApp() {
    root.querySelector('[data-score]').textContent = '↗';
    root.querySelector('[data-status]').textContent = 'Opened in Verax';
    root.querySelector('[data-summary]').textContent = 'This site blocked the in-page check, so Verax opened the main app instead.';
    root.querySelector('[data-evidence]').innerHTML = '';
  }

  function extractCanvasStats(canvas) {
    const width = canvas.width;
    const height = canvas.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const { data } = context.getImageData(0, 0, width, height);
    const luminance = new Float32Array(width * height);
    let lumaSum = 0;
    let lumaSq = 0;
    let saturationSum = 0;
    let channelDiffSum = 0;
    let grayscalePixels = 0;

    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) * 255;
      const saturation = max === 0 ? 0 : (max - min) / max;
      const channelDiff = (Math.abs(r - g) + Math.abs(g - b) + Math.abs(r - b)) / 3;
      luminance[p] = luma;
      lumaSum += luma;
      lumaSq += luma * luma;
      saturationSum += saturation;
      channelDiffSum += channelDiff;
      if (channelDiff < 0.035) grayscalePixels += 1;
    }

    let edgeHits = 0;
    let smoothHits = 0;
    let neighborComparisons = 0;
    let highContrastHits = 0;
    for (let y = 0; y < height - 1; y += 1) {
      for (let x = 0; x < width - 1; x += 1) {
        const p = y * width + x;
        const diff = Math.max(Math.abs(luminance[p] - luminance[p + 1]), Math.abs(luminance[p] - luminance[p + width]));
        neighborComparisons += 1;
        if (diff > 24) edgeHits += 1;
        if (diff < 4) smoothHits += 1;
        if (diff > 62) highContrastHits += 1;
      }
    }

    const pixels = width * height;
    const mean = lumaSum / pixels;
    const variance = Math.max(0, lumaSq / pixels - mean * mean);

    return {
      sampleWidth: width,
      sampleHeight: height,
      grayscaleRatio: Number((grayscalePixels / pixels).toFixed(3)),
      meanLuminance: Number(mean.toFixed(1)),
      luminanceStd: Number(Math.sqrt(variance).toFixed(1)),
      saturationMean: Number((saturationSum / pixels).toFixed(3)),
      channelDiffMean: Number((channelDiffSum / pixels).toFixed(3)),
      edgeDensity: Number((edgeHits / Math.max(1, neighborComparisons)).toFixed(3)),
      smoothness: Number((smoothHits / Math.max(1, neighborComparisons)).toFixed(3)),
      highContrastDensity: Number((highContrastHits / Math.max(1, neighborComparisons)).toFixed(3))
    };
  }

  async function captureScreenImage() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Screen capture is not available in this browser.');
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 }, audio: false });
    const video = document.createElement('video');
    try {
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      await new Promise((resolve) => {
        if (video.videoWidth && video.videoHeight) {
          resolve();
          return;
        }
        video.onloadedmetadata = resolve;
      });

      const maxSample = 1280;
      const scale = Math.min(maxSample / video.videoWidth, maxSample / video.videoHeight, 1);
      const width = Math.max(1, Math.round(video.videoWidth * scale));
      const height = Math.max(1, Math.round(video.videoHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, width, height);

      return {
        name: `verax-screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
        type: 'image/png',
        size: Math.round(width * height * 4),
        width,
        height,
        lastModified: new Date().toISOString(),
        lastModifiedAgeDays: 0,
        source: 'screen-capture',
        visualStats: extractCanvasStats(canvas)
      };
    } finally {
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  function scanViaScript(payload) {
    return new Promise((resolve, reject) => {
      const callbackName = `__clairityScan${Date.now()}${Math.random().toString(16).slice(2)}`;
      const callback = `window.${callbackName}`;
      const script = document.createElement('script');
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Check timed out'));
      }, 12000);

      function cleanup() {
        window.clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
      }

      window[callbackName] = (data) => {
        cleanup();
        if (data?.error) {
          reject(new Error(data.error));
          return;
        }
        resolve(data);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error('The page blocked the audit request'));
      };

      script.src = `${origin}/api/scan?callback=${encodeURIComponent(callback)}&payload=${encodeURIComponent(JSON.stringify(compactPayload(payload)))}`;
      document.documentElement.append(script);
    });
  }

  async function scan(payload, busyLabel, options = {}) {
    setBusy(busyLabel);
    try {
      const result = await localRunScan(payload);
      render(result);
    } catch (error) {
      try {
        const data = await scanViaScript(payload);
        render(data.result);
      } catch (fallbackError) {
        if (options.allowOpenInApp || options.fallbackWindow) {
          openInApp(payload, options.fallbackWindow);
          renderOpenedInApp();
          return;
        }
        renderError(error.message ? error : fallbackError);
      }
    }
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[char]));
  }

  function setPosition(x, y) {
    state.x = Math.max(8, Math.min(window.innerWidth - root.offsetWidth - 8, x));
    state.y = Math.max(8, Math.min(window.innerHeight - root.offsetHeight - 8, y));
    root.style.left = `${state.x}px`;
    root.style.top = `${state.y}px`;
    root.style.right = 'auto';
  }

  root.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('[data-drag-handle]')) return;
    if (event.target.closest('button, a, input, textarea, select')) return;
    state.dragging = true;
    state.startX = event.clientX - root.getBoundingClientRect().left;
    state.startY = event.clientY - root.getBoundingClientRect().top;
    root.setPointerCapture(event.pointerId);
  });
  root.addEventListener('pointermove', (event) => {
    if (!state.dragging) return;
    setPosition(event.clientX - state.startX, event.clientY - state.startY);
  });
  root.addEventListener('pointerup', () => {
    state.dragging = false;
  });
  root.addEventListener('pointercancel', () => {
    state.dragging = false;
  });

  root.querySelector('[data-close]').addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });
  root.querySelector('[data-close]').addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    state.dragging = false;
    root.remove();
  });
  root.querySelector('[data-scan-page]').addEventListener('click', () => {
    scan({ type: 'url', url: location.href, content: location.href, pageSnapshot: pageSnapshot() }, 'Reading page structure...');
  });
  root.querySelector('[data-scan-selection]').addEventListener('click', () => {
    scan({ type: 'text', content: window.getSelection().toString().trim() || pageSnippet() }, 'Reading selected text...');
  });
  root.querySelector('[data-scan-url]').addEventListener('click', () => {
    scan({ type: 'url', url: location.href, content: location.href, pageSnapshot: pageSnapshot() }, 'Checking page URL...');
  });
  root.querySelector('[data-capture-screen]').addEventListener('click', async () => {
    setBusy('Choose the tab, window, or screen area that contains the image.');
    try {
      const media = await captureScreenImage();
      await scan({ type: 'image', media }, 'Checking captured image texture...');
    } catch (error) {
      renderError(error);
    }
  });

  window.__clairityFloating = {
    open() {
      if (!document.querySelector('#clairity-floating-companion')) {
        document.documentElement.append(style, root);
      }
    }
  };

  document.documentElement.append(style, root);
})();
