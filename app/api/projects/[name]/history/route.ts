import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { getFileHistory, getFileAtRevision, resolveSafeProjectPath, getRepoRoot } from "@/lib/git";
import path from "path";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  const { name: project } = await ctx.params;

  const authResult = requireSession(req as unknown as Request);
  if ("error" in authResult) return authResult.error;

  const searchParams = new URL(req.url).searchParams;
  const filePath = searchParams.get("path");
  const sha = searchParams.get("sha");

  if (!filePath) {
    return NextResponse.json({ ok: false, error: "path query param required" }, { status: 400 });
  }

  const absolutePath = resolveSafeProjectPath(project, filePath);
  const repoRelativePath = path.relative(getRepoRoot(), absolutePath);

  if (sha) {
    try {
      const content = await getFileAtRevision(repoRelativePath, sha);
      return NextResponse.json({ ok: true, content });
    } catch (error: any) {
      return NextResponse.json(
        { ok: false, error: `Could not retrieve file at revision ${sha}: ${error.message}` },
        { status: 404 }
      );
    }
  }

  const perPage = Math.min(Number(searchParams.get("per_page") || "30"), 100);
  try {
    const commits = await getFileHistory(repoRelativePath, perPage);
    return NextResponse.json({ ok: true, commits });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: `Could not read git history: ${error.message}` },
      { status: 500 }
    );
  }
}
