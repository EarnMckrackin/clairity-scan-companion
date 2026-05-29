// Service worker: owns the offscreen document (which runs the C2PA SDK) and
// relays provenance requests from content scripts to it.

const OFFSCREEN_PATH = 'offscreen.html';
let creating = null; // de-dupe concurrent createDocument calls

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (creating) {
    await creating;
    return;
  }
  creating = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['WORKERS'],
    justification: 'Read Content Credentials (C2PA) from media using WebAssembly.'
  });
  try {
    await creating;
  } finally {
    creating = null;
  }
}

async function readProvenance(url) {
  if (!url) return { status: 'unknown', reason: 'no-url' };
  try {
    await ensureOffscreen();
    return await chrome.runtime.sendMessage({ target: 'offscreen', type: 'VERAX_READ_PROVENANCE', url });
  } catch (error) {
    return { status: 'unknown', reason: 'offscreen-failed' };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    clairityEnabled: true,
    clairityShowBadges: true,
    clairitySimpleMode: true
  });

  chrome.contextMenus.create({
    id: 'clairity-review-media',
    title: 'Check media with Verax',
    contexts: ['image', 'video']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'CLAIRITY_CONTEXT_REVIEW', srcUrl: info.srcUrl });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Provenance requests come from content scripts; ignore the offscreen relay.
  if (message && message.type === 'VERAX_PROVENANCE' && message.target !== 'offscreen') {
    readProvenance(message.url).then(sendResponse);
    return true; // async response
  }
  return false;
});
