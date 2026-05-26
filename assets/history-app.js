import { clearScans, deleteScan, listScans, readableType } from './clairity-store.js';

const list = document.querySelector('#historyList');
const empty = document.querySelector('#emptyHistory');
const total = document.querySelector('#historyTotal');
const review = document.querySelector('#reviewCount');
const filters = document.querySelectorAll('[data-filter]');
let currentFilter = 'all';
let scans = [];

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function icon(type) {
  if (type === 'url') return 'URL';
  if (type === 'text') return 'TXT';
  if (type === 'audio') return 'AUD';
  if (type === 'video') return 'VID';
  return 'IMG';
}

function matches(scan) {
  if (currentFilter === 'all') return true;
  if (currentFilter === 'care') return scan.tone === 'care';
  if (currentFilter === 'concern') return scan.tone === 'concern';
  if (currentFilter === 'ok') return scan.tone === 'ok';
  return true;
}

function render() {
  const visible = scans.filter(matches);
  total.textContent = String(scans.length);
  review.textContent = String(scans.filter((scan) => scan.tone !== 'ok').length);
  empty.classList.toggle('notice-hidden', visible.length > 0);
  list.innerHTML = visible.map((scan) => `
    <article class="history-item" data-id="${escapeHtml(scan.id)}">
      <span class="media-icon">${icon(scan.type)}</span>
      <div>
        <span class="history-title">${escapeHtml(scan.label || readableType(scan.type))}</span>
        <span class="history-meta">${escapeHtml(readableType(scan.type))} · ${escapeHtml(scan.status)} · ${escapeHtml(scan.summary)}</span>
        <span class="history-meta">${new Date(scan.createdAt).toLocaleString()}</span>
      </div>
      <span class="mini-score">${escapeHtml(scan.score)}</span>
      <button class="secondary-btn compact-btn" type="button" data-delete="${escapeHtml(scan.id)}">Delete</button>
    </article>
  `).join('');
}

async function refresh() {
  scans = await listScans();
  render();
}

filters.forEach((button) => {
  button.addEventListener('click', () => {
    filters.forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    currentFilter = button.dataset.filter;
    render();
  });
});

list.addEventListener('click', async (event) => {
  const id = event.target?.dataset?.delete;
  if (!id) return;
  await deleteScan(id);
  await refresh();
});

document.querySelector('#clearHistory').addEventListener('click', async () => {
  await clearScans();
  await refresh();
});

window.addEventListener('clairity:history', refresh);
refresh();
