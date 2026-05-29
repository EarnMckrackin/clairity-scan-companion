const summary = document.querySelector("#summary");
const enabledToggle = document.querySelector("#enabledToggle");
const badgeToggle = document.querySelector("#badgeToggle");
const simpleToggle = document.querySelector("#simpleToggle");
const scanButton = document.querySelector("#scanButton");

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function setSummary(result) {
  if (!result) {
    summary.textContent = "Could not check this page.";
    return;
  }
  summary.textContent = `${result.count} visible media item(s). ${result.verified} with verified origin, ${result.flagged} flagged (AI or altered), ${result.unconfirmed} not confirmed.`;
}

async function sendToPage(message) {
  const tab = await activeTab();
  if (!tab?.id) return null;
  return chrome.tabs.sendMessage(tab.id, message);
}

async function scan() {
  try {
    setSummary(await sendToPage({ type: "CLAIRITY_SCAN" }));
  } catch {
    summary.textContent = "Refresh the page and try again.";
  }
}

async function saveAndToggle() {
  const enabled = enabledToggle.checked;
  const showBadges = badgeToggle.checked;
  const simpleMode = simpleToggle.checked;
  // These storage keys remain for compatibility with existing installs.
  await chrome.storage.sync.set({
    clairityEnabled: enabled,
    clairityShowBadges: showBadges,
    clairitySimpleMode: simpleMode,
  });
  try {
    setSummary(await sendToPage({ type: "CLAIRITY_TOGGLE", enabled, showBadges, simpleMode }));
  } catch {
    summary.textContent = "Settings saved. Refresh the page to apply here.";
  }
}

chrome.storage.sync.get(["clairityEnabled", "clairityShowBadges", "clairitySimpleMode"], (values) => {
  enabledToggle.checked = values.clairityEnabled !== false;
  badgeToggle.checked = values.clairityShowBadges !== false;
  simpleToggle.checked = values.clairitySimpleMode !== false;
});

scanButton.addEventListener("click", scan);
enabledToggle.addEventListener("change", saveAndToggle);
badgeToggle.addEventListener("change", saveAndToggle);
simpleToggle.addEventListener("change", saveAndToggle);
scan();
