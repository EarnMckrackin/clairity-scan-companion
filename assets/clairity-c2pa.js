// Content Credentials (C2PA) provenance check.
//
// This is the one signal in the app that can actually confirm where a file came
// from: a cryptographically signed manifest embedded in the file bytes. Cameras
// (Leica, Sony, Nikon), Adobe, OpenAI, Google, and others sign their output, and
// AI tools disclose generation through the IPTC "digital source type".
//
// It runs entirely in the browser via WebAssembly, so the raw file never leaves
// the device. If anything fails to load or parse, we return an "unknown" result
// and never a false "verified" or false "altered" — fail safe, never fail loud.

// Self-hosted SDK (vendored under assets/vendor/) — no third-party CDN at
// runtime, so the provenance check works offline-friendly and fully private.
// Paths resolve relative to this module, so they work from any page depth.
const C2PA_VERSION = '0.30.17';
const SDK_URL = new URL('./vendor/c2pa.esm.js', import.meta.url).href;
const WASM_SRC = new URL('./vendor/assets/wasm/toolkit_bg.wasm', import.meta.url).href;
const WORKER_SRC = new URL('./vendor/c2pa.worker.min.js', import.meta.url).href;

// File types the C2PA toolkit can read manifests from.
const SUPPORTED = /\.(jpe?g|png|webp|avif|heic|heif|tiff?|dng|gif|svg|mp4|mov|m4a|m4v|wav|mp3|pdf)$/i;
const SUPPORTED_MIME = /^(image\/(jpeg|png|webp|avif|heic|heif|tiff|gif|svg\+xml)|video\/(mp4|quicktime)|audio\/(mp4|wav|x-wav|mpeg)|application\/pdf)$/i;

// IPTC digital source types that mean "a model made or substantially shaped this".
const AI_SOURCE_TYPE = /trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia/i;

// Validation codes that mean the bytes don't match the signed manifest (real
// tampering) rather than "we just don't recognize the signer".
const TAMPER_CODE = /(dataHash|hashedURI|timeStamp)\.mismatch|claimSignature\.(mismatch|missing)|assertion\.(missing|undeclared)|manifest\.(multipleParents|inaccessible)/i;

// Known generators worth surfacing by name even when no source type is set.
const KNOWN_AI_GENERATOR = /openai|dall[\s.\-]?e|chatgpt|firefly|midjourney|stable\s?diffusion|gemini|imagen|veo|sora|copilot|designer|leonardo|ideogram|grok|flux/i;

let instancePromise = null;

function loadC2pa() {
  if (!instancePromise) {
    instancePromise = import(/* @vite-ignore */ SDK_URL)
      .then(({ createC2pa }) => createC2pa({ wasmSrc: WASM_SRC, workerSrc: WORKER_SRC }))
      .catch((error) => {
        instancePromise = null; // allow a later retry
        throw error;
      });
  }
  return instancePromise;
}

export function provenanceApplies(file) {
  if (!file || !file.name) return false;
  return SUPPORTED.test(file.name) || SUPPORTED_MIME.test(file.type || '');
}

function assertionList(manifest) {
  const accessor = manifest?.assertions;
  if (!accessor) return [];
  if (Array.isArray(accessor)) return accessor;
  if (Array.isArray(accessor.data)) return accessor.data;
  if (typeof accessor.get === 'function') {
    return [...(accessor.get('c2pa.actions') || []), ...(accessor.get('c2pa.actions.v2') || [])];
  }
  return [];
}

function detectAi(manifest) {
  const result = { isAi: false, sourceType: '', tool: '' };

  for (const entry of assertionList(manifest)) {
    const label = entry?.label || '';
    const data = entry?.data || entry || {};
    const actions = data.actions || (Array.isArray(data) ? data : []);
    for (const action of actions || []) {
      const sourceType = action?.digitalSourceType || '';
      if (AI_SOURCE_TYPE.test(sourceType)) {
        result.isAi = true;
        result.sourceType = sourceType.split('/').pop();
        if (action.softwareAgent) result.tool = String(action.softwareAgent);
      }
    }
    // Some generators only flag AI through a dedicated assertion label.
    if (/generative[-.]?ai|trainingMining|ai[-.]?generated/i.test(label)) {
      result.isAi = true;
      result.sourceType = result.sourceType || 'declared in manifest';
    }
  }

  const generator = String(manifest?.claimGenerator || manifest?.claimGeneratorInfo?.[0]?.name || '');
  if (KNOWN_AI_GENERATOR.test(generator)) {
    result.tool = result.tool || generator.split(/[\s/]+/)[0];
    // A known AI generator alone is suggestive but not proof of generation
    // (e.g. Photoshop opening a camera photo); only the source type is decisive.
  }
  return result;
}

function tamperErrors(manifestStore) {
  const statuses = manifestStore?.validationStatus || [];
  return statuses.filter((status) => TAMPER_CODE.test(status?.code || ''));
}

/**
 * Inspect a raw File/Blob for Content Credentials.
 * Returns a normalized result; `status` is the only field callers should branch on:
 *   'valid'   — signed manifest present, bytes intact, not AI-flagged
 *   'ai'      — signed manifest discloses AI generation/editing
 *   'altered' — manifest present but bytes don't match the signature
 *   'none'    — no manifest found
 *   'unknown' — couldn't run the check (load/parse error, or unsupported type)
 */
export async function inspectProvenance(file) {
  if (!provenanceApplies(file)) {
    return { status: 'unknown', reason: 'unsupported', available: false };
  }

  let c2pa;
  try {
    c2pa = await loadC2pa();
  } catch (error) {
    return { status: 'unknown', reason: 'sdk-load-failed', available: false, error: String(error?.message || error) };
  }

  try {
    const { manifestStore } = await c2pa.read(file);
    const manifest = manifestStore?.activeManifest;
    if (!manifestStore || !manifest) {
      return { status: 'none', available: true };
    }

    const tampering = tamperErrors(manifestStore);
    const ai = detectAi(manifest);
    const generator = String(manifest.claimGenerator || manifest.claimGeneratorInfo?.[0]?.name || '').trim();
    const issuer = manifest.signatureInfo?.issuer || manifest.signatureInfo?.commonName || '';
    const time = manifest.signatureInfo?.time || '';

    let status;
    if (tampering.length) status = 'altered';
    else if (ai.isAi) status = 'ai';
    else status = 'valid';

    return {
      status,
      available: true,
      generator,
      issuer,
      time,
      aiTool: ai.tool,
      sourceType: ai.sourceType,
      tampering: tampering.map((item) => item.code),
      ingredientCount: Array.isArray(manifest.ingredients) ? manifest.ingredients.length : 0
    };
  } catch (error) {
    return { status: 'unknown', reason: 'read-failed', available: false, error: String(error?.message || error) };
  }
}
