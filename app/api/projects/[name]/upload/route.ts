import { NextRequest, NextResponse } from "next/server";
import { verifySessionFromRequest } from "@/lib/session";
import { putBinaryAtPath, getFileMeta } from "@/lib/github";

/**
 * POST /api/projects/[name]/upload
 * Content-Type: multipart/form-data
 *
 * Fields:
 *   files[]    — one or more File objects
 *   targetDir  — optional subdirectory inside the project (e.g. "images")
 *
 * Each file is committed to: <project>/<targetDir>/<file.name>
 * Handles binary files (images, PDFs) correctly via Buffer → base64.
 *
 * Response: { ok: true, results: [{ path, ok, error? }] }
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  const { name: project } = await ctx.params;
  try { verifySessionFromRequest(req as unknown as Request); }
  catch { return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }); }

  let formData: FormData;
  try { formData = await req.formData(); }
  catch (e: any) { return NextResponse.json({ ok: false, error: `Bad form data: ${e.message}` }, { status: 400 }); }

  const targetDir = ((formData.get("targetDir") as string) ?? "").replace(/^\/|\/$/g, "");
  const files     = formData.getAll("files") as File[];

  if (!files.length) {
    return NextResponse.json({ ok: false, error: "No files provided" }, { status: 400 });
  }

  const results: { path: string; ok: boolean; error?: string }[] = [];

  for (const file of files) {
    // webkitRelativePath is set when uploading a folder; fall back to file.name
    const relativePath = ((file as any).webkitRelativePath as string | undefined)
      || file.name;

    // Sanitise: prevent path traversal
    const safePath = relativePath.replace(/\.\./g, "_").replace(/^\//, "");

    const repoPath = targetDir
      ? `${project}/${targetDir}/${safePath}`
      : `${project}/${safePath}`;

    try {
      const buffer = Buffer.from(await file.arrayBuffer());

      // Fetch existing SHA (required for update; absent on first upload)
      let sha: string | undefined;
      try {
        const meta = await getFileMeta(repoPath, req as unknown as Request);
        sha = meta?.sha;
      } catch {/* file doesn't exist yet — OK */}

      await putBinaryAtPath(repoPath, buffer, `Upload ${safePath}`, req as unknown as Request, sha);
      results.push({ path: safePath, ok: true });
    } catch (e: any) {
      results.push({ path: safePath, ok: false, error: e.message });
    }
  }

  const allOk = results.every(r => r.ok);
  return NextResponse.json({ ok: allOk, results });
}
