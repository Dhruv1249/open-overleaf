import { NextResponse, NextRequest } from "next/server";
import { readFileAtPath, getFileMeta, putFileAtPath, deleteFileAtPath } from "@/lib/github";
import { verifySessionFromRequest } from "@/lib/session";

// POST /api/projects/[name]/rename
// body: { from: string, to: string }
// Renames/moves a file by reading it, writing to new path, then deleting old path.
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

    const fullFrom = `${project}/${fromPath}`;
    const fullTo = `${project}/${toPath}`;

    // 1. Read the current file content + sha
    const meta = await getFileMeta(fullFrom, req as unknown as Request);
    if (!meta?.sha) return NextResponse.json({ ok: false, error: "source file not found" }, { status: 404 });
    const content = meta.content
      ? Buffer.from(meta.content, "base64").toString("utf8")
      : "";

    // 2. Create at new path
    await putFileAtPath(fullTo, content, `Rename ${fromPath} → ${toPath}`, req as unknown as Request);

    // 3. Delete the old path
    await deleteFileAtPath(fullFrom, `Delete ${fromPath} (renamed)`, meta.sha, req as unknown as Request);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
