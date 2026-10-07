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
  try {
    const stored = await loadSettingsFile();
    cache = merge(stored);
    return cache;
  } catch (e) {
    // Driveから設定(ロゴ・振込先の変更内容など)を読めなくても、既定の会社情報で
    // PDFの発行自体は継続できるようにする。失敗はキャッシュせず、次回また読み直しを試みる。
    console.error("設定の読み込みに失敗したため既定値を使用します:", e.message);
    return merge(null);
  }
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
