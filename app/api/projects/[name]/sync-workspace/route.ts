import { NextRequest, NextResponse } from "next/server";
import { verifySessionFromRequest } from "@/lib/session";
import { listDirectory } from "@/lib/github";
import fs from "fs";
import path from "path";

// ── GitHub file fetch (same helper as in compile route) ────────────────────────
async function fetchGitHubFileBuffer(
  repoPath: string,
  token: string | undefined
): Promise<Buffer | null> {
  const owner  = process.env.GITHUB_SINGLE_REPO_OWNER;
  const repo   = process.env.GITHUB_SINGLE_REPO_NAME;
  const branch = process.env.DEFAULT_BRANCH || "main";
  const encoded = repoPath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encoded}?ref=${branch}`;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `token ${token}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (data?.content != null) return Buffer.from(data.content, "base64");
  return null;
}

/**
 * POST /api/projects/[name]/sync-workspace
 *
 * Syncs all project files from GitHub to /tmp/oo-workspace so that
 * TexLab (the LSP server) can see the full multi-file project structure:
 * - Cross-file jump-to-definition / completions
 * - \input{} / \include{} resolution
 * - .bib file indexing
 *
 * Called once when a project is opened in the editor (non-blocking fire-and-forget).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  const { name: project } = await ctx.params;
  const session = verifySessionFromRequest(req as unknown as Request);
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const token    = (session as any)?.access_token as string | undefined;
  const destDir  = "/tmp/oo-workspace";

  // Sync in background — return immediately so the editor doesn't block
  setImmediate(async () => {
    try {
      await syncDir(project, destDir, token, req as unknown as Request);
    } catch (e) {
      console.error("[sync-workspace]", e);
    }
  });

  return NextResponse.json({ ok: true });
}

async function syncDir(ghDirPath: string, localDir: string, token: string | undefined, req: Request) {
  fs.mkdirSync(localDir, { recursive: true });
  const entries = await listDirectory(ghDirPath, req);
  // Skip .overleaf.json — not needed by TexLab
  const filtered = entries.filter((e: any) => e.name !== ".overleaf.json");

  await Promise.all(
    filtered.map(async (entry: { name: string; path: string; type: string }) => {
      const localPath = path.join(localDir, entry.name);
      if (entry.type === "dir") {
        await syncDir(entry.path, localPath, token, req);
      } else {
        const buf = await fetchGitHubFileBuffer(entry.path, token);
        if (buf !== null) {
          fs.mkdirSync(path.dirname(localPath), { recursive: true });
          fs.writeFileSync(localPath, buf);
        }
      }
    })
  );
}
