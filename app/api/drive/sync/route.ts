import { NextRequest, NextResponse } from "next/server";
import { verifySessionFromRequest } from "@/lib/session";
import {
  getValidAccessToken,
  ensureDrivePath,
  uploadOrUpdatePdf,
  getDriveFileId,
  setDriveFileId,
} from "@/lib/google-drive";
import fs from "fs";
import path from "path";

/**
 * POST /api/drive/sync
 * Body: { project: string, mainFile: string }
 *
 * Mirrors the project path into Drive under "open-overleaf-projects":
 *   open-overleaf-projects/
 *     <project>/
 *       [<subdirs from mainFile>/]
 *         <name>.pdf
 *
 * Re-syncing uses PATCH → file ID is stable → sharing link never changes.
 */
export async function POST(req: NextRequest) {
  try { verifySessionFromRequest(req as unknown as Request); }
  catch { return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }); }

  const body: { project?: string; mainFile?: string } = await req.json().catch(() => ({}));
  const { project, mainFile } = body;

  if (!project || !mainFile) {
    return NextResponse.json({ ok: false, error: "project and mainFile are required" }, { status: 400 });
  }

  // ── Find compiled PDF on disk ─────────────────────────────────────────────
  const pdfName = path.basename(mainFile).replace(/\.tex$/, ".pdf");
  const pdfPath = `/tmp/oo-compile/${project}/${pdfName}`;

  if (!fs.existsSync(pdfPath)) {
    return NextResponse.json(
      { ok: false, error: "No compiled PDF found — compile the project first." },
      { status: 404 }
    );
  }
  const pdfBuffer = fs.readFileSync(pdfPath);

  // ── Build the mirrored Drive folder path ─────────────────────────────────
  // mainFile may be nested, e.g. "chapters/intro/main.tex"
  // → subDirs = ["chapters", "intro"]
  const mainFileDir = path.dirname(mainFile);
  const subDirs     = mainFileDir === "." ? [] : mainFileDir.split("/").filter(Boolean);

  // Full folder tree in Drive:  open-overleaf-projects / project / [...subDirs]
  const folderSegments = ["open-overleaf-projects", project, ...subDirs];

  // Stable lookup key for the file-ID cache (path that uniquely identifies this PDF)
  const driveKey = [...folderSegments, pdfName].join("/");

  try {
    const accessToken  = await getValidAccessToken();
    const leafFolderId = await ensureDrivePath(accessToken, folderSegments);
    const existingId   = getDriveFileId(driveKey);

    const fileId = await uploadOrUpdatePdf({
      fileName:   pdfName,
      pdfBuffer,
      parentId:   leafFolderId,
      existingId,
    });

    setDriveFileId(driveKey, fileId);

    // This link is stable — PATCH updates never change the file ID
    const webViewLink = `https://drive.google.com/file/d/${fileId}/view`;
    return NextResponse.json({ ok: true, fileId, webViewLink, drivePath: driveKey });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 502 });
  }
}
