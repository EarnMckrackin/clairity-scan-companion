function removeExisting() {
  document.querySelector('#clairity-overlay-root')?.remove();
}

function showOverlay(result, error) {
  removeExisting();
  const root = document.createElement('aside');
  root.id = 'clairity-overlay-root';
  root.style.cssText = [
    'position:fixed',
    'right:18px',
    'top:18px',
    'z-index:2147483647',
    'width:min(360px, calc(100vw - 36px))',
    'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
    'color:#1e293b',
    'background:white',
    'border:1px solid #dbe5ea',
    'border-radius:18px',
    'box-shadow:0 18px 60px rgba(15,23,42,.18)',
    'padding:16px'
  ].join(';');

  if (error) {
    root.innerHTML = `
      <strong style="display:block;font-size:18px;margin-bottom:8px">clAIrity could not scan this page</strong>
      <p style="margin:0 0 12px;color:#64748b;line-height:1.45">${escapeHtml(error)}</p>
      <button id="clairity-close" style="${buttonStyle()}">Close</button>
    `;
  } else {
    root.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px">
        <strong style="font-size:18px">clAIrity</strong>
        <span style="border-radius:999px;background:#fff3c4;color:#795000;padding:6px 10px;font-weight:800">${escapeHtml(result.score)}</span>
      </div>
      <strong style="display:block;font-size:20px;margin-bottom:8px">${escapeHtml(result.status)}</strong>
      <p style="margin:0 0 12px;color:#64748b;line-height:1.45">${escapeHtml(result.summary)}</p>
      <p style="margin:0 0 12px;color:#334155;line-height:1.45"><b>Next:</b> ${escapeHtml(result.nextStep)}</p>
      <button id="clairity-close" style="${buttonStyle()}">Hide</button>
    `;
  }

  document.documentElement.append(root);
  document.querySelector('#clairity-close')?.addEventListener('click', removeExisting);
}

function buttonStyle() {
  return 'min-height:40px;border:0;border-radius:12px;background:#15222a;color:white;padding:0 14px;font-weight:800;cursor:pointer';
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

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CLAIRITY_SHOW_OVERLAY') showOverlay(message.result);
  if (message.type === 'CLAIRITY_SHOW_ERROR') showOverlay(null, message.error);
});
