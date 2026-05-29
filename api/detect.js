// Phase 2: probabilistic AI/deepfake detection for media that has NO Content
// Credentials (the common case). This is a SECOND opinion, not proof:
//   - C2PA (Phase 1) is cryptographic and runs privately in the browser.
//   - This detector is a statistical model and REQUIRES sending the file to a
//     third party, so the client must gate it behind explicit per-file consent.
//
// The API key lives only here, server-side. If no key is configured the endpoint
// reports `configured: false` and the app simply falls back to Phase 1 behavior.
//
// Provider adapters are swappable via env (`DETECTOR_PROVIDER`); Sightengine is
// the default. A normalized result is returned regardless of provider:
//   { available, provider, aiProbability, deepfakeProbability, mediaType }

const MAX_BYTES = 5 * 1024 * 1024; // ~5 MB binary; larger needs a different upload path
const ALLOWED_MIME = /^(image\/(jpeg|png|webp|gif|avif)|video\/(mp4|quicktime|webm)|audio\/(mpeg|mp4|wav|x-wav|aac|ogg|webm))$/i;

function mediaTypeFromMime(mime) {
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'image';
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > MAX_BYTES * 1.4) { // base64 overhead
        reject(new Error('Request too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

// ---- Provider adapters -----------------------------------------------------

// Scan an arbitrary provider response for the strongest AI / deepfake class
// score. Used by providers (e.g. Hive) whose exact schema depends on the model
// project tied to the key. Best-effort and defensive.
function scanForScores(node, acc) {
  acc = acc || { ai: null, deepfake: null };
  if (Array.isArray(node)) {
    for (const item of node) scanForScores(item, acc);
  } else if (node && typeof node === 'object') {
    const label = String(node.class ?? node.label ?? node.name ?? '').toLowerCase();
    const score = clamp01(node.score ?? node.value ?? node.confidence);
    const negative = /\b(no|not|none)[_-]|^(no|not|none)_|not_ai|no_ai|^real$|authentic/.test(label);
    if (score != null && label && !negative) {
      if (/deepfake|face_?manip|faceswap/.test(label)) acc.deepfake = Math.max(acc.deepfake ?? 0, score);
      else if (/(^|_|\b)(ai[_-]?generated|ai_art|synthetic|generated|gen_?ai)(_|\b|$)/.test(label)) acc.ai = Math.max(acc.ai ?? 0, score);
    }
    for (const key of Object.keys(node)) scanForScores(node[key], acc);
  }
  return acc;
}

const PROVIDERS = {
  sightengine: {
    supports(mediaType) {
      return mediaType === 'image' || mediaType === 'video';
    },
    isConfigured() {
      return Boolean(process.env.SIGHTENGINE_API_USER && process.env.SIGHTENGINE_API_SECRET);
    },
    async detect({ buffer, mime, name, mediaType }) {
      const isVideo = mediaType === 'video';
      const endpoint = isVideo
        ? 'https://api.sightengine.com/1.0/video/check-sync.json'
        : 'https://api.sightengine.com/1.0/check.json';

      const form = new FormData();
      form.append('media', new Blob([buffer], { type: mime }), name || (isVideo ? 'clip.mp4' : 'image.jpg'));
      form.append('models', 'genai,deepfake');
      form.append('api_user', process.env.SIGHTENGINE_API_USER);
      form.append('api_secret', process.env.SIGHTENGINE_API_SECRET);

      const response = await fetch(endpoint, { method: 'POST', body: form });
      const payload = await response.json();
      if (payload.status && payload.status !== 'success') {
        throw new Error(payload.error?.message || 'Detector request failed');
      }

      if (isVideo) {
        // Take the strongest per-frame signal across the sampled frames.
        const frames = payload.data?.frames || [];
        let ai = null;
        let deepfake = null;
        for (const frame of frames) {
          const a = clamp01(frame.type?.ai_generated);
          const d = clamp01(frame.type?.deepfake);
          if (a != null) ai = ai == null ? a : Math.max(ai, a);
          if (d != null) deepfake = deepfake == null ? d : Math.max(deepfake, d);
        }
        return { aiProbability: ai, deepfakeProbability: deepfake };
      }

      return {
        aiProbability: clamp01(payload.type?.ai_generated),
        deepfakeProbability: clamp01(payload.type?.deepfake)
      };
    }
  },

  // Hive — synchronous task API. The model project is determined by the key, so
  // we parse the response generically for AI / deepfake class scores.
  // NOTE: written to Hive's documented sync API; verify the field names against
  // your project before relying on it.
  hive: {
    supports(mediaType) {
      return mediaType === 'image' || mediaType === 'video';
    },
    isConfigured() {
      return Boolean(process.env.HIVE_API_KEY);
    },
    async detect({ buffer, mime, name }) {
      const form = new FormData();
      form.append('media', new Blob([buffer], { type: mime }), name || 'media');
      const response = await fetch('https://api.thehive.ai/api/v2/task/sync', {
        method: 'POST',
        headers: { Authorization: `Token ${process.env.HIVE_API_KEY}`, Accept: 'application/json' },
        body: form
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || `Hive returned HTTP ${response.status}`);
      const scores = scanForScores(payload.status ?? payload);
      return { aiProbability: scores.ai, deepfakeProbability: scores.deepfake };
    }
  },

  // Reality Defender — adds AUDIO deepfake detection (plus image/video). Async:
  // request a presigned upload, PUT the bytes, then poll for the analysis.
  // Polling is bounded so the serverless function cannot hang; if the job is
  // still running we report `pending` rather than blocking.
  // NOTE: written to Reality Defender's documented v2 flow; verify endpoints and
  // response fields against your account before relying on it.
  realitydefender: {
    supports(mediaType) {
      return mediaType === 'image' || mediaType === 'video' || mediaType === 'audio';
    },
    isConfigured() {
      return Boolean(process.env.REALITY_DEFENDER_API_KEY);
    },
    async detect({ buffer, name }) {
      const key = process.env.REALITY_DEFENDER_API_KEY;
      const headers = { 'X-API-KEY': key, 'Content-Type': 'application/json' };
      const fileName = name || 'media';

      const signRes = await fetch('https://api.realitydefender.com/api/files/aws-presigned', {
        method: 'POST',
        headers,
        body: JSON.stringify({ fileName })
      });
      const sign = await signRes.json();
      if (!signRes.ok) throw new Error(sign?.errno || sign?.message || 'Reality Defender upload-init failed');
      const signedUrl = sign.response?.signedUrl || sign.signedUrl;
      const requestId = sign.requestId || sign.request_id || sign.mediaId;
      if (!signedUrl || !requestId) throw new Error('Reality Defender response missing upload fields');

      const putRes = await fetch(signedUrl, { method: 'PUT', body: buffer });
      if (!putRes.ok) throw new Error(`Reality Defender upload failed (HTTP ${putRes.status})`);

      const resultUrl = `https://api.realitydefender.com/api/media/users/${encodeURIComponent(requestId)}`;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const poll = await fetch(resultUrl, { headers });
        const data = await poll.json().catch(() => ({}));
        const status = String(data.status || data.resultsSummary?.status || '').toUpperCase();
        if (status && status !== 'ANALYZING' && status !== 'PROCESSING') {
          const score = clamp01(
            data.resultsSummary?.metadata?.finalScore ??
            data.resultsSummary?.score ??
            data.score
          );
          const isFake = /MANIPULATED|FAKE|AI/.test(status) || (score != null && score >= 0.5);
          return { aiProbability: isFake ? (score ?? 0.75) : (score ?? 0.05), deepfakeProbability: score };
        }
      }
      const error = new Error('still-processing');
      error.pending = true;
      throw error;
    }
  }
};

function activeProvider() {
  const name = (process.env.DETECTOR_PROVIDER || 'sightengine').toLowerCase();
  return { name, adapter: PROVIDERS[name] };
}

// ---- Handler ---------------------------------------------------------------

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {});

  const { name, adapter } = activeProvider();
  const configured = Boolean(adapter && adapter.isConfigured());

  // Lightweight capability probe so the client can show/hide the opt-in button.
  if (req.method === 'GET') {
    return json(res, 200, { configured, provider: name });
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'Use POST /api/detect' });

  if (!configured) {
    return json(res, 200, { available: false, reason: 'not-configured', provider: name });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    return json(res, error.message === 'Request too large' ? 413 : 400, { available: false, reason: 'bad-request', error: error.message });
  }

  const mime = String(body.mime || '');
  const mediaType = mediaTypeFromMime(mime);
  if (!ALLOWED_MIME.test(mime) || !adapter.supports(mediaType)) {
    return json(res, 200, { available: false, reason: 'unsupported-type', provider: name, mediaType });
  }

  const dataBase64 = String(body.dataBase64 || '').replace(/^data:[^,]*,/, '');
  if (!dataBase64) {
    return json(res, 400, { available: false, reason: 'no-data' });
  }
  const buffer = Buffer.from(dataBase64, 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES) {
    return json(res, buffer.length ? 413 : 400, { available: false, reason: buffer.length ? 'too-large' : 'no-data' });
  }

  try {
    const result = await adapter.detect({ buffer, mime, name: body.name, mediaType });
    return json(res, 200, {
      available: true,
      provider: name,
      mediaType,
      aiProbability: result.aiProbability ?? null,
      deepfakeProbability: result.deepfakeProbability ?? null
    });
  } catch (error) {
    if (error && error.pending) {
      return json(res, 200, { available: false, reason: 'pending', provider: name, mediaType });
    }
    return json(res, 502, { available: false, reason: 'provider-error', provider: name, error: String(error?.message || error) });
  }
};
