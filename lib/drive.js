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

async function generateAndUpload({ type, issueDate, fileNameFor, pdfBuilder }) {
  const rootFolderId = process.env.DRIVE_ROOT_FOLDER_ID;
  const drive = getDriveClient();
  const subfolderId = await findOrCreateFolder(drive, SUBFOLDER_NAME[type], rootFolderId);
  const docNumber = await issueDocumentNumber(drive, subfolderId, type, issueDate);
  const pdfBuffer = await pdfBuilder(docNumber);
  const fileName = fileNameFor(docNumber);

  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [subfolderId] },
    media: { mimeType: "application/pdf", body: Readable.from([pdfBuffer]) },
    fields: "id, webViewLink",
  });

  const driveLink = res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`;
  return { docNumber, fileName, pdfBuffer, driveLink };
}

module.exports = { generateAndUpload };
