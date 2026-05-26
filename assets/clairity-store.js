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

export async function extractImageStats(file) {
  if (!file || !file.type.startsWith('image/')) return {};
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });

    const sampleSize = 160;
    const scale = Math.min(sampleSize / image.naturalWidth, sampleSize / image.naturalHeight, 1);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    return extractCanvasStats(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function extractCanvasStats(canvas) {
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
      const dx = Math.abs(luminance[p] - luminance[p + 1]);
      const dy = Math.abs(luminance[p] - luminance[p + width]);
      const diff = Math.max(dx, dy);
      neighborComparisons += 1;
      if (diff > 24) edgeHits += 1;
      if (diff < 4) smoothHits += 1;
      if (diff > 62) highContrastHits += 1;
    }
  }

  const pixels = width * height;
  const mean = lumaSum / pixels;
  const variance = Math.max(0, lumaSq / pixels - mean * mean);
  const edgeDensity = edgeHits / Math.max(1, neighborComparisons);
  const smoothness = smoothHits / Math.max(1, neighborComparisons);

  return {
    sampleWidth: width,
    sampleHeight: height,
    grayscaleRatio: Number((grayscalePixels / pixels).toFixed(3)),
    meanLuminance: Number(mean.toFixed(1)),
    luminanceStd: Number(Math.sqrt(variance).toFixed(1)),
    saturationMean: Number((saturationSum / pixels).toFixed(3)),
    channelDiffMean: Number((channelDiffSum / pixels).toFixed(3)),
    edgeDensity: Number(edgeDensity.toFixed(3)),
    smoothness: Number(smoothness.toFixed(3)),
    highContrastDensity: Number((highContrastHits / Math.max(1, neighborComparisons)).toFixed(3))
  };
}

export async function captureScreenImage() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Screen capture is not available in this browser.');
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 1 },
    audio: false
  });
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
