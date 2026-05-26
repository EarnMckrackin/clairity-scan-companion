(function () {
  if (window.__clairityFloating) {
    window.__clairityFloating.open();
    return;
  }

  const currentScript = document.currentScript;
  const origin = currentScript?.dataset?.clairityOrigin || 'https://clairity-scan-companion.vercel.app';
  const root = document.createElement('aside');
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
      <strong>cl<span>AI</span>rity</strong>
      <button type="button" data-close aria-label="Close clAIrity">×</button>
    </div>
    <div class="clairity-float-score">
      <b data-score>--</b>
      <div>
        <h2 data-status>Ready</h2>
        <p data-summary>Scan this page, selected text, or the page URL while you browse.</p>
      </div>
    </div>
    <div class="clairity-float-actions">
      <button type="button" data-scan-page>Scan page text</button>
      <button type="button" data-scan-selection>Scan selection</button>
      <button type="button" data-scan-url>Scan URL</button>
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
      border-radius: 18px;
      background: rgba(255,255,255,.98);
      color: #17212b;
      box-shadow: 0 24px 80px rgba(15,23,42,.22);
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
    #clairity-floating-companion strong { font-size: 18px; }
    #clairity-floating-companion strong span {
      border-radius: 9px;
      padding: 2px 5px;
      background: linear-gradient(135deg, #1fa58d, #438ee6);
      color: white;
      font-weight: 900;
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
      border-radius: 12px;
      background: #15222a;
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
    root.querySelector('[data-status]').textContent = 'Scanning...';
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
    root.querySelector('[data-status]').textContent = 'Could not scan';
    root.querySelector('[data-summary]').textContent = error.message || 'Try again from the web app.';
  }

  async function scan(payload, busyLabel) {
    setBusy(busyLabel);
    try {
      const response = await fetch(`${origin}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Scan failed');
      render(data.result);
    } catch (error) {
      renderError(error);
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

  root.querySelector('[data-close]').addEventListener('click', () => root.remove());
  root.querySelector('[data-scan-page]').addEventListener('click', () => {
    scan({ type: 'url', url: location.href, content: location.href, pageSnapshot: pageSnapshot() }, 'Reading page structure...');
  });
  root.querySelector('[data-scan-selection]').addEventListener('click', () => {
    scan({ type: 'text', content: window.getSelection().toString().trim() || pageSnippet() }, 'Reading selected text...');
  });
  root.querySelector('[data-scan-url]').addEventListener('click', () => {
    scan({ type: 'url', url: location.href, content: location.href }, 'Checking page URL...');
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
