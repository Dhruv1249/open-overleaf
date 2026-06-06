import { NextResponse, NextRequest } from "next/server";
import {
  getFileMeta,
  putFileAtPath,
  putBinaryAtPath,
  deleteFileAtPath,
  listAllFilesInDir,
  deleteDirectoryAtPath,
} from "@/lib/github";
import { verifySessionFromRequest } from "@/lib/session";

// POST /api/projects/[name]/rename
// body: { from: string, to: string }
// Paths are project-root-relative (e.g. "chapters/intro.tex")
// Handles both single files and entire directories.
export async function POST(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  try {
    verifySessionFromRequest(req as unknown as Request);
    const { name: project } = await ctx.params;
    const body = await req.json();
    const { from: fromPath, to: toPath } = body;
    if (!fromPath || !toPath)
      return NextResponse.json({ ok: false, error: "from and to paths required" }, { status: 400 });
    if (fromPath === toPath)
      return NextResponse.json({ ok: false, error: "from and to are the same" }, { status: 400 });

    // Full repo-relative paths (as GitHub API expects them)
    const fullFrom = `${project}/${fromPath}`;
    const fullTo   = `${project}/${toPath}`;

    // ── Detect file vs directory by inspecting the raw GitHub response ────────
    // getFileMeta returns an array for directories (GitHub listing) or
    // an object with { type: "file", sha, content, ... } for files.
    const meta = await getFileMeta(fullFrom, req as unknown as Request);
    const isDirectory = Array.isArray(meta) || meta?.type === "dir";

    if (isDirectory) {
      // ── Directory move: enumerate all files, copy to new path, delete originals ──
      const files = await listAllFilesInDir(fullFrom, req as unknown as Request);

      for (const { path: srcFullPath } of files) {
        // srcFullPath is full repo-relative, e.g. "project/olddir/sub/file.tex"
        const srcMeta = await getFileMeta(srcFullPath, req as unknown as Request);
        if (Array.isArray(srcMeta) || srcMeta?.type !== "file" || srcMeta.content == null) continue;
        
        const rawBase64 = srcMeta.content.replace(/\n/g, "");
        const buffer = Buffer.from(rawBase64, "base64");

        // Replace the old dir prefix with the new dir prefix
        const destFullPath = srcFullPath.replace(fullFrom, fullTo);

        // Fetch destination SHA if it exists, to avoid 422 error
        let destSha: string | undefined;
        try {
          const destMeta = await getFileMeta(destFullPath, req as unknown as Request);
          if (destMeta && !Array.isArray(destMeta)) destSha = destMeta.sha;
        } catch {/* file doesn't exist yet */}

        await putBinaryAtPath(
          destFullPath,
          buffer,
          `Move ${srcFullPath} → ${destFullPath}`,
          req as unknown as Request,
          destSha
        );
      }

      // Delete the old directory tree
      await deleteDirectoryAtPath(fullFrom, req as unknown as Request);

      return NextResponse.json({ ok: true });
    } else {
      // ── Single file move ──────────────────────────────────────────────────────
      if (!meta?.sha || meta.content == null)
        return NextResponse.json({ ok: false, error: "source file not found" }, { status: 404 });
      
      const rawBase64 = meta.content.replace(/\n/g, "");
      const buffer = Buffer.from(rawBase64, "base64");

      // Fetch destination SHA if it exists
      let destSha: string | undefined;
      try {
        const destMeta = await getFileMeta(fullTo, req as unknown as Request);
        if (destMeta && !Array.isArray(destMeta)) destSha = destMeta.sha;
      } catch {/* file doesn't exist yet */}

      // 1. Write to the new path
      await putBinaryAtPath(fullTo, buffer, `Rename ${fromPath} → ${toPath}`, req as unknown as Request, destSha);

      // 2. Delete the old path (using sha we already fetched)
      await deleteFileAtPath(fullFrom, `Delete ${fromPath} (renamed)`, meta.sha, req as unknown as Request);

      return NextResponse.json({ ok: true });
    }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
