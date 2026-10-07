const { google } = require("googleapis");
const { Readable } = require("stream");

const FOLDER_MIME = "application/vnd.google-apps.folder";
const SUBFOLDER_NAME = { invoice: "請求書", quote: "見積書", receipt: "領収書" };
const TYPE_LABEL = { invoice: "請", quote: "見", receipt: "領" };

function getDriveClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost"
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  return google.drive({ version: "v3", auth });
}

async function findOrCreateFolder(drive, name, parentId) {
  const q = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    `'${parentId}' in parents`,
    `mimeType = '${FOLDER_MIME}'`,
    "trashed = false",
  ].join(" and ");

  const list = await drive.files.list({ q, fields: "files(id, name)" });
  if (list.data.files && list.data.files.length > 0) {
    return list.data.files[0].id;
  }

  const created = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: "id",
  });
  return created.data.id;
}

/**
 * サーバーはディスクを永続化しないため、その日の連番はDrive上の既存ファイル数から都度算出する。
 * 同時アクセスが多い業務ではないため、多少の競合は許容する。
 */
async function issueDocumentNumber(drive, subfolderId, type, issueDate) {
  const dateKey = issueDate.replace(/-/g, "");
  const q = [
    `'${subfolderId}' in parents`,
    `name contains '${dateKey}'`,
    "trashed = false",
  ].join(" and ");
  const list = await drive.files.list({ q, fields: "files(id, name)" });
  const count = (list.data.files || []).length;
  const seqStr = String(count + 1).padStart(2, "0");
  return `楓CT-${TYPE_LABEL[type]}-${dateKey}-${seqStr}`;
}

const SETTINGS_FILE_NAME = "settings.json";

async function findSettingsFile(drive, rootFolderId) {
  const q = [
    `'${rootFolderId}' in parents`,
    `name = '${SETTINGS_FILE_NAME}'`,
    "trashed = false",
  ].join(" and ");
  const list = await drive.files.list({ q, fields: "files(id, name)" });
  return (list.data.files && list.data.files[0]) || null;
}

async function loadSettingsFile() {
  const rootFolderId = process.env.DRIVE_ROOT_FOLDER_ID;
  const drive = getDriveClient();
  const file = await findSettingsFile(drive, rootFolderId);
  if (!file) return null;
  const res = await drive.files.get({ fileId: file.id, alt: "media" });
  return typeof res.data === "string" ? JSON.parse(res.data) : res.data;
}

async function saveSettingsFile(settings) {
  const rootFolderId = process.env.DRIVE_ROOT_FOLDER_ID;
  const drive = getDriveClient();
  const existing = await findSettingsFile(drive, rootFolderId);
  const media = { mimeType: "application/json", body: Readable.from([JSON.stringify(settings)]) };
  if (existing) {
    await drive.files.update({ fileId: existing.id, media });
  } else {
    await drive.files.create({
      requestBody: { name: SETTINGS_FILE_NAME, parents: [rootFolderId] },
      media,
      fields: "id",
    });
  }
}

function driveErrorMessage(e) {
  return e?.response?.data?.error_description || e?.response?.data?.error || e?.message || String(e);
}

/**
 * Drive側の書類番号採番に失敗した場合のフォールバック。
 * 日付+時刻ベースのため、Drive復旧後の正式な連番とはズレるが、PDF自体は必ず発行できる。
 */
function fallbackDocNumber(type, issueDate) {
  const dateKey = (issueDate || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  const timeSuffix = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
  return `楓CT-${TYPE_LABEL[type]}-${dateKey}-T${timeSuffix}`;
}

/**
 * PDF生成はGoogle Driveが使えるかどうかに関わらず必ず成功させる。
 * Drive側(書類番号の採番・アップロード)はベストエフォートとし、失敗してもdriveErrorを
 * 添えて返すだけでPDF自体の発行は止めない(Driveの認証切れでPDFすら作れなくなる事故を防ぐ)。
 */
async function generateAndUpload({ type, issueDate, fileNameFor, pdfBuilder }) {
  const rootFolderId = process.env.DRIVE_ROOT_FOLDER_ID;

  let drive;
  let subfolderId;
  let docNumber;
  let driveError = null;

  try {
    drive = getDriveClient();
    subfolderId = await findOrCreateFolder(drive, SUBFOLDER_NAME[type], rootFolderId);
    docNumber = await issueDocumentNumber(drive, subfolderId, type, issueDate);
  } catch (e) {
    driveError = driveErrorMessage(e);
    docNumber = fallbackDocNumber(type, issueDate);
  }

  const pdfBuffer = await pdfBuilder(docNumber);
  const fileName = fileNameFor(docNumber);

  let driveLink = null;
  if (!driveError) {
    try {
      const res = await drive.files.create({
        requestBody: { name: fileName, parents: [subfolderId] },
        media: { mimeType: "application/pdf", body: Readable.from([pdfBuffer]) },
        fields: "id, webViewLink",
      });
      driveLink = res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`;
    } catch (e) {
      driveError = driveErrorMessage(e);
    }
  }

  return { docNumber, fileName, pdfBuffer, driveLink, driveError };
}

module.exports = { generateAndUpload, loadSettingsFile, saveSettingsFile };
