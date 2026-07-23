const { COMPANY: DEFAULT_COMPANY, BANK: DEFAULT_BANK } = require("./config");
const { loadSettingsFile, saveSettingsFile } = require("./drive");

let cache = null;

function merge(stored) {
  return {
    company: { ...DEFAULT_COMPANY, ...(stored?.company || {}) },
    bank: { ...DEFAULT_BANK, ...(stored?.bank || {}) },
    logoDataUri: stored?.logoDataUri || null,
    hankoDataUri: stored?.hankoDataUri || null,
  };
}

async function getSettings() {
  if (cache) return cache;
  const stored = await loadSettingsFile();
  cache = merge(stored);
  return cache;
}

async function saveSettings(partial) {
  const current = await getSettings();
  const next = {
    company: { ...current.company, ...(partial.company || {}) },
    bank: { ...current.bank, ...(partial.bank || {}) },
    logoDataUri: partial.logoDataUri !== undefined ? partial.logoDataUri : current.logoDataUri,
    hankoDataUri: partial.hankoDataUri !== undefined ? partial.hankoDataUri : current.hankoDataUri,
  };
  await saveSettingsFile(next);
  cache = next;
  return next;
}

module.exports = { getSettings, saveSettings };
