import { clearScans, getSettings, saveSettings } from './clairity-store.js';

const settings = getSettings();

function syncToggle(button) {
  const key = button.dataset.setting;
  const enabled = Boolean(getSettings()[key]);
  button.classList.toggle('off', !enabled);
  button.setAttribute('aria-label', `${button.dataset.label} ${enabled ? 'on' : 'off'}`);
}

document.querySelectorAll('[data-setting]').forEach((button) => {
  syncToggle(button);
  button.addEventListener('click', () => {
    const key = button.dataset.setting;
    const next = saveSettings({ [key]: !getSettings()[key] });
    button.classList.toggle('off', !next[key]);
    button.setAttribute('aria-label', `${button.dataset.label} ${next[key] ? 'on' : 'off'}`);
  });
});

const retention = document.querySelector('#retentionHours');
retention.value = String(settings.uploadRetentionHours);
retention.addEventListener('change', () => {
  saveSettings({ uploadRetentionHours: Number(retention.value) });
});

const apiBase = document.querySelector('#apiBase');
apiBase.value = settings.apiBase;
apiBase.addEventListener('change', () => {
  saveSettings({ apiBase: apiBase.value.trim().replace(/\/$/, '') });
});

document.querySelector('#clearLocalHistory').addEventListener('click', async () => {
  await clearScans();
  document.querySelector('#settingsMessage').textContent = 'Local scan history cleared.';
});
