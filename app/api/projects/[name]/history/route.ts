import { NextRequest, NextResponse } from "next/server";
import { verifySessionFromRequest } from "@/lib/session";

function ghHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (token) h.Authorization = `token ${token}`;
  return h;
}

// Retry a fetch up to `retries` times on transient network failures (EAI_AGAIN etc.)
async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  retries = 2
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, { headers });
    } catch (e: any) {
      lastErr = e;
      // Only retry on transient DNS / ECONNRESET errors, not 4xx/5xx
      const code: string = e?.cause?.code ?? e?.code ?? "";
      const isTransient = ["EAI_AGAIN", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND"].includes(code);
      if (!isTransient || attempt === retries) break;
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// ── GET /api/projects/[name]/history?path=<filePath>[&sha=<commitSha>] ────────
// Without sha  → returns commit list for the file (Mode B)
// With    sha  → returns raw file content at that commit (Mode A)
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

  const searchParams = new URL(req.url).searchParams;
  const path         = searchParams.get("path");
  const sha          = searchParams.get("sha");

  if (!path) {
    return NextResponse.json({ ok: false, error: "path query param required" }, { status: 400 });
  }

  // Full repo path = project/file
  const repoPath = `${project}/${path}`;
  const encode   = (p: string) => p.split("/").filter(Boolean).map(encodeURIComponent).join("/");

  // ── Mode A: file content at a specific commit ─────────────────────────────
  if (sha) {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encode(repoPath)}?ref=${sha}`;
    try {
      const resp = await fetchWithRetry(apiUrl, ghHeaders(token));
      if (!resp.ok) {
        return NextResponse.json(
          { ok: false, error: `GitHub: ${resp.status} ${resp.statusText}` },
          { status: resp.status }
        );
      }
      const data    = await resp.json();
      const content = data?.content != null
        ? Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8")
        : "";
      return NextResponse.json({ ok: true, content });
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: `Network error fetching commit content: ${e?.cause?.code ?? e?.message ?? "unknown"}` },
        { status: 502 }
      );
    }
  }

  // ── Mode B: commit list for the file ─────────────────────────────────────
  const perPage = Math.min(Number(searchParams.get("per_page") || "30"), 100);
  const apiUrl  = `https://api.github.com/repos/${owner}/${repo}/commits`
    + `?sha=${branch}&path=${encode(repoPath)}&per_page=${perPage}`;

  try {
    const resp = await fetchWithRetry(apiUrl, ghHeaders(token));
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `GitHub: ${resp.status} ${body}` },
        { status: resp.status }
      );
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
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: `Network error fetching commits: ${e?.cause?.code ?? e?.message ?? "unknown"}` },
      { status: 502 }
    );
  }
}
