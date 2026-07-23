const puppeteer = require("puppeteer-core");

async function launchBrowser() {
  if (process.env.CHROME_EXECUTABLE_PATH) {
    return puppeteer.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE_PATH });
  }
  if (process.platform === "linux") {
    const chromium = require("@sparticuz/chromium");
    return puppeteer.launch({
      headless: true,
      args: chromium.args,
      executablePath: await chromium.executablePath(),
    });
  }
  // ローカル開発(Windows/Mac)用のフォールバック。事前に `npm i -D puppeteer` して
  // 環境変数 CHROME_EXECUTABLE_PATH を設定するか、下記のデフォルト検出に任せる。
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  ];
  const fs = require("fs");
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error("ローカル用のChrome実行ファイルが見つかりません。CHROME_EXECUTABLE_PATH を設定してください。");
  }
  return puppeteer.launch({ headless: true, executablePath: found });
}

async function htmlToPdfBuffer(html) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    // フォント・画像はすべてdata URIとして埋め込み済みで外部通信は発生しないため、
    // networkidle0は使わない(巨大な埋め込みフォントのせいで安定して成立せずタイムアウトすることがあった)。
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluateHandle("document.fonts.ready");
    const bytes = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  } finally {
    await browser.close();
  }
}

module.exports = { htmlToPdfBuffer };
