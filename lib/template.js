const fs = require("fs");
const path = require("path");
const { COMPANY, BANK, ITEM_COLUMNS } = require("./config");

const TITLE = { invoice: "請求書", quote: "見積書", receipt: "領収書" };
const ASSETS_DIR = path.join(__dirname, "..", "assets");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function yen(n) {
  const num = Number(n) || 0;
  return `¥${num.toLocaleString("ja-JP")}`;
}

function rowTotal(item) {
  const fare = Number(item.fare) || 0;
  const equipment = Number(item.equipment) || 0;
  const care = Number(item.care) || 0;
  const etc = Number(item.etc) || 0;
  const discount = Number(item.discount) || 0;
  return fare + equipment + care + etc - discount;
}

function fileToDataUri(fileName) {
  const filePath = path.join(ASSETS_DIR, fileName);
  if (!fs.existsSync(filePath)) return null;
  const data = fs.readFileSync(filePath).toString("base64");
  return `data:image/png;base64,${data}`;
}

// デプロイ先(Render等のLinux)には日本語フォントが入っていないため、
// システムフォント任せにせずNoto Sans JPを埋め込んで文字化けを防ぐ。
let cachedFontFace = null;
function fontFaceCss() {
  if (cachedFontFace !== null) return cachedFontFace;
  const fontPath = path.join(ASSETS_DIR, "fonts", "NotoSansJP-Regular.woff2");
  if (!fs.existsSync(fontPath)) {
    cachedFontFace = "";
    return cachedFontFace;
  }
  const data = fs.readFileSync(fontPath).toString("base64");
  cachedFontFace = `
  @font-face {
    font-family: "Noto Sans JP";
    src: url(data:font/woff2;base64,${data}) format("woff2");
    font-weight: 400 700;
  }`;
  return cachedFontFace;
}

function renderHtml(payload, docNumber) {
  const title = TITLE[payload.type];
  const items = payload.items || [];
  const grandTotal = items.reduce((sum, item) => sum + rowTotal(item), 0);
  const logoUri = fileToDataUri("logo.png");
  const hankoUri = fileToDataUri("hanko.png");

  const itemRows = items
    .map((item) => {
      const cells = ITEM_COLUMNS.map((col) => {
        if (!col.numeric) return `<td>${esc(item[col.key])}</td>`;
        const v = Number(item[col.key]) || 0;
        if (!v) return `<td class="num"></td>`;
        return `<td class="num">${col.isDiscount ? "-" : ""}${yen(v)}</td>`;
      }).join("");
      return `<tr>${cells}<td class="num row-total">${yen(rowTotal(item))}</td></tr>`;
    })
    .join("\n");

  let dateLine = "";
  if (payload.type === "invoice" && payload.dueDate) {
    dateLine = `<div class="meta-row"><span>お支払期限</span><span>${esc(payload.dueDate)}</span></div>`;
  } else if (payload.type === "quote" && payload.validUntil) {
    dateLine = `<div class="meta-row"><span>見積有効期限</span><span>${esc(payload.validUntil)}</span></div>`;
  }

  const bankBlock = payload.type === "invoice" ? `
    <section class="bank">
      <h2>お振込先</h2>
      <p>${esc(BANK.bankName)}　${esc(BANK.branchName)}　${esc(BANK.accountType)}　${esc(BANK.accountNumber)}<br>
      口座名義: ${esc(BANK.accountHolder)}</p>
    </section>` : "";

  const voucherBlock = payload.type === "receipt" ? `
    <div class="voucher">
      <div>但し　${esc(payload.description || "介護タクシー利用料として")}</div>
      <div>上記正に領収いたしました。</div>
    </div>` : "";

  const registrationLine = COMPANY.invoiceRegistrationNumber
    ? `<div>登録番号: ${esc(COMPANY.invoiceRegistrationNumber)}</div>` : "";

  const noteBlock = payload.note ? `
    <section class="note">
      <h2>備考</h2>
      <p>${esc(payload.note).replace(/\n/g, "<br>")}</p>
    </section>` : "";

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<style>
  ${fontFaceCss()}
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif; color: #222; font-size: 12px; }
  h1.title { text-align: center; font-size: 24px; letter-spacing: 0.4em; margin: 0 0 20px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
  .doc-meta { text-align: right; font-size: 12px; line-height: 1.6; }
  .customer { font-size: 15px; margin: 10px 0 20px; }
  .customer .name { font-size: 18px; border-bottom: 2px solid #333; padding-bottom: 4px; display: inline-block; min-width: 220px; }
  .company { text-align: right; font-size: 11px; line-height: 1.6; }
  .company .logo { height: 46px; margin-bottom: 6px; }
  .company .info { position: relative; display: inline-block; text-align: right; padding-right: 40px; }
  .company .hanko { position: absolute; top: 2px; right: 0; width: 56px; opacity: 0.95; z-index: 2; }
  .company .name { font-size: 14px; font-weight: bold; margin-bottom: 2px; }
  .company .representative { margin-bottom: 4px; }
  .voucher { margin: 4px 0 16px; font-size: 13px; line-height: 1.8; }
  .total-box { display: flex; justify-content: space-between; align-items: center; background: #f4f4f4; border: 1px solid #999; padding: 10px 16px; margin: 14px 0 18px; }
  .total-box .label { font-size: 14px; font-weight: bold; }
  .total-box .amount { font-size: 22px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #999; padding: 6px 8px; }
  th { background: #eee; text-align: center; }
  td.num, th.num { text-align: right; }
  td.row-total { font-weight: bold; }
  .bank, .note { margin-top: 18px; }
  .bank h2, .note h2 { font-size: 12px; margin: 0 0 6px; border-left: 4px solid #666; padding-left: 6px; }
  .meta-row { display: flex; justify-content: space-between; gap: 12px; }
  .footer-note { margin-top: 24px; font-size: 10px; color: #666; }
</style>
</head>
<body>
  <h1 class="title">${title}</h1>
  <div class="header">
    <div class="customer">
      <div class="name">${esc(payload.customerName)}　様</div>
      ${payload.customerAddress ? `<div>${esc(payload.customerAddress)}</div>` : ""}
    </div>
    <div class="company">
      ${logoUri ? `<img class="logo" src="${logoUri}">` : ""}
      <div class="info">
        ${hankoUri ? `<img class="hanko" src="${hankoUri}">` : ""}
        <div class="name">${esc(COMPANY.name)}</div>
        ${COMPANY.representative ? `<div class="representative">代表　${esc(COMPANY.representative)}</div>` : ""}
        <div>〒${esc(COMPANY.postalCode)} ${esc(COMPANY.address)}</div>
        <div>TEL: ${esc(COMPANY.tel)}</div>
        <div>${esc(COMPANY.email)}</div>
        ${registrationLine}
      </div>
    </div>
  </div>

  <div class="doc-meta">
    <div class="meta-row"><span>書類番号</span><span>${esc(docNumber)}</span></div>
    <div class="meta-row"><span>発行日</span><span>${esc(payload.issueDate)}</span></div>
    ${dateLine}
  </div>

  <div class="total-box">
    <span class="label">合計金額(税込)</span>
    <span class="amount">${yen(grandTotal)}</span>
  </div>

  ${voucherBlock}

  <table>
    <thead>
      <tr>${ITEM_COLUMNS.map((c) => `<th${c.numeric ? ' class="num"' : ""}>${esc(c.label)}</th>`).join("")}<th class="num">小計</th></tr>
    </thead>
    <tbody>
      ${itemRows || `<tr><td colspan="${ITEM_COLUMNS.length + 1}" style="text-align:center;color:#999;">明細なし</td></tr>`}
    </tbody>
  </table>

  ${bankBlock}
  ${noteBlock}

  <div class="footer-note">
    ${(payload.type === "invoice" || payload.type === "receipt") && !COMPANY.invoiceRegistrationNumber ? "※適格請求書発行事業者の登録はしておりません。" : ""}
  </div>
</body>
</html>`;
}

module.exports = { renderHtml, rowTotal, yen };
