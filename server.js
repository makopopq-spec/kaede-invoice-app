require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const basicAuth = require("express-basic-auth");
const { renderHtml } = require("./lib/template");
const { htmlToPdfBuffer } = require("./lib/pdf");
const { generateAndUpload } = require("./lib/drive");
const { getSettings, saveSettings } = require("./lib/settingsStore");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  basicAuth({
    users: { [process.env.BASIC_AUTH_USER || "kaede"]: process.env.BASIC_AUTH_PASSWORD || "changeme" },
    challenge: true,
    realm: "kaede-care-taxi-invoice",
  })
);

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "6mb" }));
app.use(express.static(path.join(__dirname, "public")));

// PDFはディスクに残さず、短時間だけメモリに保持してiPhoneからのダウンロードに使う。
const pdfCache = new Map();
const PDF_TTL_MS = 15 * 60 * 1000;

function cachePdf(fileName, buffer) {
  const id = crypto.randomBytes(12).toString("hex");
  // puppeteer-coreはBufferではなくUint8Arrayを返すことがあるため、Expressのres.sendが
  // 誤ってJSON化しないよう明示的にBufferへ変換しておく。
  const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  pdfCache.set(id, { fileName, buffer: nodeBuffer, expires: Date.now() + PDF_TTL_MS });
  return id;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of pdfCache) {
    if (entry.expires < now) pdfCache.delete(id);
  }
}, 5 * 60 * 1000).unref();

function combineDateTime(item) {
  if (!item.visitDate) return item.date || "";
  let display = item.visitDate;
  if (item.startTime) {
    display += ` ${item.startTime}`;
    if (item.endTime) display += `〜${item.endTime}`;
  }
  return display;
}

function normalizeItems(rawItems) {
  if (!rawItems) return [];
  const list = Array.isArray(rawItems) ? rawItems : Object.values(rawItems);
  return list
    .map((item) => (item ? { ...item, date: combineDateTime(item) } : item))
    .filter((item) => {
      if (!item) return false;
      const hasText = item.date || item.detail;
      const hasAmount = ["fare", "equipment", "care", "etc", "discount"].some((k) => Number(item[k]) > 0);
      return hasText || hasAmount;
    });
}

app.post("/generate", async (req, res) => {
  try {
    const body = req.body;
    if (!["invoice", "quote", "receipt"].includes(body.type)) {
      return res.status(400).json({ ok: false, error: "typeが不正です" });
    }
    if (!body.customerName) {
      return res.status(400).json({ ok: false, error: "お客様名を入力してください" });
    }
    const items = normalizeItems(body.items);
    if (items.length === 0) {
      return res.status(400).json({ ok: false, error: "明細を1件以上入力してください" });
    }

    const payload = {
      type: body.type,
      customerName: body.customerName,
      customerAddress: body.customerAddress || "",
      issueDate: body.issueDate,
      dueDate: body.type === "invoice" ? body.dueDate || "" : "",
      validUntil: body.type === "quote" ? body.dueDate || "" : "",
      description: body.type === "receipt" ? body.description || "" : "",
      items,
      note: body.note || "",
    };

    const safeCustomer = payload.customerName.replace(/[\\/:*?"<>|]/g, "_");
    const typeLabel = { invoice: "請求書", quote: "見積書", receipt: "領収書" }[payload.type];
    const settings = await getSettings();

    const { docNumber, fileName, pdfBuffer, driveLink, driveError } = await generateAndUpload({
      type: payload.type,
      issueDate: payload.issueDate,
      fileNameFor: (docNumber) => `${typeLabel}_${docNumber}_${safeCustomer}.pdf`,
      pdfBuilder: async (docNumber) => htmlToPdfBuffer(renderHtml(payload, docNumber, settings)),
    });

    const pdfId = cachePdf(fileName, pdfBuffer);

    // DriveへのアップロードはベストエフォートなのでPDFさえ作れていればok:trueを返す。
    // driveErrorがある場合は画面側で警告を出しつつPDFリンクは必ず案内する。
    res.json({ ok: true, docNumber, driveLink, driveError, pdfUrl: `/pdf/${pdfId}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/settings", async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({ ok: true, settings });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/settings", async (req, res) => {
  try {
    const body = req.body || {};
    const settings = await saveSettings({
      company: body.company || {},
      bank: body.bank || {},
      logoDataUri: body.logoDataUri,
      hankoDataUri: body.hankoDataUri,
    });
    res.json({ ok: true, settings });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/pdf/:id", (req, res) => {
  const entry = pdfCache.get(req.params.id);
  if (!entry) return res.status(404).send("このPDFの有効期限が切れました。もう一度作成してください。");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(entry.fileName)}"`);
  res.send(entry.buffer);
});

app.listen(PORT, () => console.log(`kaede-invoice-app listening on port ${PORT}`));
