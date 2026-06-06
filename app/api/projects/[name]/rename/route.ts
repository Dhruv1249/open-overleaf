import { NextResponse, NextRequest } from "next/server";
import {
  getFileMeta,
  putFileAtPath,
  deleteFileAtPath,
  listAllFilesInDir,
  deleteDirectoryAtPath,
  readFileAtPath,
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
        const content = await readFileAtPath(srcFullPath, req as unknown as Request) ?? "";
        // Replace the old dir prefix with the new dir prefix
        const destFullPath = srcFullPath.replace(fullFrom, fullTo);
        await putFileAtPath(
          destFullPath,
          content,
          `Move ${srcFullPath} → ${destFullPath}`,
          req as unknown as Request
        );
      }

      // Delete the old directory tree
      await deleteDirectoryAtPath(fullFrom, req as unknown as Request);

      return NextResponse.json({ ok: true });
    } else {
      // ── Single file move ──────────────────────────────────────────────────────
      if (!meta?.sha)
        return NextResponse.json({ ok: false, error: "source file not found" }, { status: 404 });
      const content = meta.content
        ? Buffer.from(meta.content, "base64").toString("utf8")
        : "";

      // 1. Write to the new path
      await putFileAtPath(fullTo, content, `Rename ${fromPath} → ${toPath}`, req as unknown as Request);

      // 2. Delete the old path (using sha we already fetched)
      await deleteFileAtPath(fullFrom, `Delete ${fromPath} (renamed)`, meta.sha, req as unknown as Request);

      return NextResponse.json({ ok: true });
    }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
