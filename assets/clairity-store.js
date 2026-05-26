const DB_NAME = 'clairity-local';
const DB_VERSION = 1;
const SCAN_STORE = 'scans';
const SETTINGS_KEY = 'clairity-settings';

const DEFAULT_SETTINGS = {
  saveSummaries: true,
  saveUploadedMedia: false,
  familyMode: true,
  extensionWarnings: true,
  uploadRetentionHours: 24,
  apiBase: ''
};

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SCAN_STORE)) {
        const store = db.createObjectStore(SCAN_STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('tone', 'tone');
        store.createIndex('type', 'type');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transact(mode, callback) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(SCAN_STORE, mode);
    const store = transaction.objectStore(SCAN_STORE);
    const result = callback(store);
    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  }));
}

export function getSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  const next = { ...getSettings(), ...settings };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('clairity:settings', { detail: next }));
  return next;
}

export async function saveScan(scan) {
  const settings = getSettings();
  if (!settings.saveSummaries) return scan;

  const record = {
    ...scan,
    savedAt: new Date().toISOString(),
    sourcePreview: scan.sourcePreview || '',
    mediaBlobSaved: false
  };

  await transact('readwrite', (store) => store.put(record));
  window.dispatchEvent(new CustomEvent('clairity:history', { detail: record }));
  return record;
}

export async function listScans() {
  return transact('readonly', (store) => new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const scans = request.result || [];
      scans.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      resolve(scans);
    };
    request.onerror = () => reject(request.error);
  }));
}

export async function getScan(id) {
  return transact('readonly', (store) => new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  }));
}

export async function deleteScan(id) {
  await transact('readwrite', (store) => store.delete(id));
  window.dispatchEvent(new CustomEvent('clairity:history'));
}

export async function clearScans() {
  await transact('readwrite', (store) => store.clear());
  window.dispatchEvent(new CustomEvent('clairity:history'));
}

export function getApiBase() {
  const settings = getSettings();
  return settings.apiBase.replace(/\/$/, '');
}

export async function runScan(payload) {
  const response = await fetch(`${getApiBase()}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Scan failed');
  }
  return data.result;
}

export async function extractImageDimensions(file) {
  if (!file || !file.type.startsWith('image/')) return {};
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function fileMetadata(file, dimensions = {}) {
  const ageMs = Date.now() - (file.lastModified || Date.now());
  return {
    name: file.name,
    type: file.type || 'unknown',
    size: file.size,
    lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null,
    lastModifiedAgeDays: Math.max(0, Math.round(ageMs / 86400000)),
    ...dimensions
  };
}

export function readableType(type) {
  if (type === 'url') return 'Web link';
  if (type === 'text') return 'Text';
  if (type === 'audio') return 'Audio';
  if (type === 'video') return 'Video';
  return 'Image';
}
