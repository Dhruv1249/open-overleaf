/**
 * lib/google-drive.ts
 *
 * Token management, folder mirroring, and Drive upload/update helpers.
 * Tokens and IDs are stored in /tmp (never committed).
 *
 * Drive folder structure created:
 *   open-overleaf-projects/
 *     <project>/
 *       <subdir (if mainFile is in a subdir)>/
 *         <name>.pdf   ← PATCH updates this; file ID (= sharing link) never changes
 */
import fs from "fs";

const TOKEN_FILE   = "/tmp/oo-google-tokens.json";
const FILE_ID_FILE = "/tmp/oo-drive-file-ids.json";    // path → Drive file ID
const FOLDER_FILE  = "/tmp/oo-drive-folder-ids.json";  // cumulative path → Drive folder ID

export type GTokens = {
  access_token:  string;
  refresh_token: string;
  expires_at:    number; // epoch ms
};

// ── Token persistence ─────────────────────────────────────────────────────────
export function readTokens(): GTokens | null {
  try { return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8")); } catch { return null; }
}
export function writeTokens(t: GTokens) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(t, null, 2), "utf8");
}
export function clearTokens() {
  try { fs.unlinkSync(TOKEN_FILE); } catch {}
  try { fs.unlinkSync(FILE_ID_FILE); } catch {}
  try { fs.unlinkSync(FOLDER_FILE); } catch {}
}
export function isConnected(): boolean { return readTokens() !== null; }

// ── Access-token with auto-refresh ────────────────────────────────────────────
export async function getValidAccessToken(): Promise<string> {
  const tokens = readTokens();
  if (!tokens) throw new Error("Google Drive not connected");

  if (Date.now() < tokens.expires_at - 60_000) return tokens.access_token;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  });
  if (!resp.ok) throw new Error(`Token refresh failed: ${await resp.text()}`);

  const d = await resp.json();
  const refreshed: GTokens = {
    access_token:  d.access_token,
    refresh_token: tokens.refresh_token,   // Google only re-issues refresh_token on first auth
    expires_at:    Date.now() + d.expires_in * 1000,
  };
  writeTokens(refreshed);
  return refreshed.access_token;
}

// ── File ID persistence (stable → sharing link never changes on update) ────────
function readFileIds(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(FILE_ID_FILE, "utf8")); } catch { return {}; }
}
function writeFileIds(m: Record<string, string>) {
  fs.writeFileSync(FILE_ID_FILE, JSON.stringify(m, null, 2), "utf8");
}
export function getDriveFileId(key: string): string | undefined {
  return readFileIds()[key];
}
export function setDriveFileId(key: string, id: string) {
  const m = readFileIds(); m[key] = id; writeFileIds(m);
}

// ── Folder ID persistence ─────────────────────────────────────────────────────
function readFolderIds(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(FOLDER_FILE, "utf8")); } catch { return {}; }
}
function writeFolderIds(m: Record<string, string>) {
  fs.writeFileSync(FOLDER_FILE, JSON.stringify(m, null, 2), "utf8");
}

// ── Drive folder helpers ───────────────────────────────────────────────────────
async function driveGet(accessToken: string, url: string): Promise<any> {
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) throw new Error(`Drive GET ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

async function findFolder(
  accessToken: string, name: string, parentId: string
): Promise<string | null> {
  const safe = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q    = `name='${safe}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const data = await driveGet(
    accessToken,
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`
  );
  return (data.files?.[0]?.id as string) ?? null;
}

async function createFolder(
  accessToken: string, name: string, parentId: string
): Promise<string> {
  const resp = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  if (!resp.ok) throw new Error(`Create folder failed: ${resp.status} ${await resp.text()}`);
  return ((await resp.json()).id) as string;
}

/**
 * Ensures all segments of a path exist in Drive (as nested folders),
 * creating any missing ones. Returns the leaf folder's Drive ID.
 *
 * Example: ["open-overleaf-projects", "my-project", "chapters"]
 *   → creates/finds each folder in sequence, returns "chapters" folder ID.
 *
 * Results are cached in /tmp so repeated syncs don't hit the API unnecessarily.
 */
export async function ensureDrivePath(
  accessToken: string,
  segments: string[]
): Promise<string> {
  const folderIds = readFolderIds();
  let parentId    = "root";
  let cumPath     = "";

  for (const seg of segments) {
    cumPath = cumPath ? `${cumPath}/${seg}` : seg;

    if (folderIds[cumPath]) {
      parentId = folderIds[cumPath];
      continue;
    }

    // Try to find existing; create if missing
    let fId = await findFolder(accessToken, seg, parentId);
    if (!fId) fId = await createFolder(accessToken, seg, parentId);

    folderIds[cumPath] = fId;
    writeFolderIds(folderIds);
    parentId = fId;
  }

  return parentId;
}

// ── PDF upload / update (sharing link is stable — PATCH keeps file ID) ─────────
export async function uploadOrUpdatePdf(opts: {
  fileName:    string;
  pdfBuffer:   Buffer;
  parentId:    string;
  existingId?: string;
}): Promise<string> {
  const accessToken = await getValidAccessToken();
  const { fileName, pdfBuffer, parentId, existingId } = opts;

  const boundary = "oo_drive_mp_" + Math.random().toString(36).slice(2);
  const metadata: Record<string, any> = { name: fileName, mimeType: "application/pdf" };
  if (!existingId) metadata.parents = [parentId];

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`, "utf8"),
    Buffer.from(`--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`, "utf8"),
    pdfBuffer,
    Buffer.from(`\r\n--${boundary}--`, "utf8"),
  ]);

  const url    = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart&fields=id,webViewLink`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink`;
  const method = existingId ? "PATCH" : "POST";

  const resp = await fetch(url, {
    method,
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!resp.ok) throw new Error(`Drive upload ${resp.status}: ${await resp.text()}`);

  const data = await resp.json();
  return data.id as string;
}
