import { NextRequest, NextResponse } from "next/server";
import { verifySessionFromRequest } from "@/lib/session";

function ghHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (token) h.Authorization = `token ${token}`;
  return h;
}

// ── GET /api/projects/[name]/history?path=<filePath>[&sha=<commitSha>] ────────
// Without sha  → returns commit list for the file
// With    sha  → returns raw file content at that commit
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  const { name: project } = await ctx.params;

  let session: any;
  try { session = verifySessionFromRequest(req as unknown as Request); }
  catch { return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }); }

  const token = session?.access_token as string | undefined;
  const owner  = process.env.GITHUB_SINGLE_REPO_OWNER;
  const repo   = process.env.GITHUB_SINGLE_REPO_NAME;
  const branch = process.env.DEFAULT_BRANCH || "main";

  if (!owner || !repo) {
    return NextResponse.json({ ok: false, error: "GitHub repo not configured" }, { status: 500 });
  }

  const url    = new URL(req.url);
  const path   = url.searchParams.get("path");
  const sha    = url.searchParams.get("sha");

  if (!path) {
    return NextResponse.json({ ok: false, error: "path query param required" }, { status: 400 });
  }

  // Full repo path = project/file
  const repoPath = `${project}/${path}`;

  // ── Mode A: file content at a specific commit ─────────────────────────────
  if (sha) {
    const encoded = repoPath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
    const apiUrl  = `https://api.github.com/repos/${owner}/${repo}/contents/${encoded}?ref=${sha}`;
    const resp    = await fetch(apiUrl, { headers: ghHeaders(token) });
    if (!resp.ok) {
      return NextResponse.json({ ok: false, error: `GitHub: ${resp.status}` }, { status: resp.status });
    }
    const data = await resp.json();
    const content = data?.content != null
      ? Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8")
      : "";
    return NextResponse.json({ ok: true, content });
  }

  // ── Mode B: commit list for the file ─────────────────────────────────────
  const perPage = Math.min(Number(url.searchParams.get("per_page") || "30"), 100);
  const encoded = repoPath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const apiUrl  = `https://api.github.com/repos/${owner}/${repo}/commits`
    + `?sha=${branch}&path=${encoded}&per_page=${perPage}`;

  const resp = await fetch(apiUrl, { headers: ghHeaders(token) });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    return NextResponse.json({ ok: false, error: `GitHub: ${resp.status} ${body}` }, { status: resp.status });
  }

  const commits: any[] = await resp.json();
  const items = commits.map((c: any) => ({
    sha:     c.sha,
    message: c.commit?.message ?? "",
    author:  c.commit?.author?.name ?? c.commit?.committer?.name ?? "Unknown",
    date:    c.commit?.author?.date ?? c.commit?.committer?.date ?? "",
    url:     c.html_url ?? "",
  }));

  return NextResponse.json({ ok: true, commits: items });
}
