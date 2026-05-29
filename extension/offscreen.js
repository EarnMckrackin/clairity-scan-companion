// Offscreen document: reads Content Credentials (C2PA) from media bytes using
// the vendored WebAssembly SDK. This runs in an extension page (DOM + Workers
// available) — content scripts and service workers can't host the SDK.
//
// It fetches the media itself: an extension page with <all_urls> host permission
// can read cross-origin responses, so no separate background fetch is needed.
// The raw bytes never leave the browser.

import { createC2pa } from './vendor/c2pa.esm.js';

const AI_SOURCE_TYPE = /trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia/i;
const TAMPER_CODE = /(dataHash|hashedURI|timeStamp)\.mismatch|claimSignature\.(mismatch|missing)|assertion\.(missing|undeclared)/i;
const KNOWN_AI_GENERATOR = /openai|dall[\s.\-]?e|chatgpt|firefly|midjourney|stable\s?diffusion|gemini|imagen|veo|sora|copilot|designer|leonardo|ideogram|grok|flux/i;
const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 40 * 1024 * 1024; // skip very large media to stay responsive

let instancePromise = null;
function getC2pa() {
  if (!instancePromise) {
    instancePromise = createC2pa({
      wasmSrc: chrome.runtime.getURL('vendor/assets/wasm/toolkit_bg.wasm'),
      workerSrc: chrome.runtime.getURL('vendor/c2pa.worker.min.js')
    }).catch((error) => {
      instancePromise = null;
      throw error;
    });
  }
  return instancePromise;
}

function assertionList(manifest) {
  const accessor = manifest && manifest.assertions;
  if (!accessor) return [];
  if (Array.isArray(accessor)) return accessor;
  if (Array.isArray(accessor.data)) return accessor.data;
  return [];
}

function detectAi(manifest) {
  const out = { isAi: false, sourceType: '', tool: '' };
  for (const entry of assertionList(manifest)) {
    const data = (entry && entry.data) || entry || {};
    const actions = data.actions || (Array.isArray(data) ? data : []);
    for (const action of actions || []) {
      if (action && AI_SOURCE_TYPE.test(action.digitalSourceType || '')) {
        out.isAi = true;
        out.sourceType = String(action.digitalSourceType).split('/').pop();
        if (action.softwareAgent) out.tool = String(action.softwareAgent);
      }
    }
    if (/generative[-.]?ai|ai[-.]?generated/i.test(entry && entry.label || '')) out.isAi = true;
  }
  const generator = String((manifest && manifest.claimGenerator) || '');
  if (KNOWN_AI_GENERATOR.test(generator)) out.tool = out.tool || generator.split(/[\s/]+/)[0];
  return out;
}

async function readProvenance(url) {
  let c2pa;
  try {
    c2pa = await getC2pa();
  } catch (error) {
    return { status: 'unknown', reason: 'sdk-load-failed' };
  }

  let blob;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return { status: 'unknown', reason: 'fetch-failed' };
    blob = await response.blob();
    if (blob.size > MAX_BYTES) return { status: 'unknown', reason: 'too-large' };
  } catch (error) {
    return { status: 'unknown', reason: 'fetch-failed' };
  }

  try {
    const { manifestStore } = await c2pa.read(blob);
    const manifest = manifestStore && manifestStore.activeManifest;
    if (!manifest) return { status: 'none' };

    const tampering = (manifestStore.validationStatus || []).filter((s) => TAMPER_CODE.test((s && s.code) || ''));
    const ai = detectAi(manifest);
    let status = 'valid';
    if (tampering.length) status = 'altered';
    else if (ai.isAi) status = 'ai';

    return {
      status,
      generator: String(manifest.claimGenerator || '').trim(),
      issuer: (manifest.signatureInfo && manifest.signatureInfo.issuer) || '',
      aiTool: ai.tool,
      sourceType: ai.sourceType
    };
  } catch (error) {
    return { status: 'unknown', reason: 'read-failed' };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.target === 'offscreen' && message.type === 'VERAX_READ_PROVENANCE') {
    readProvenance(message.url).then(sendResponse);
    return true; // async response
  }
  return false;
});
