import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { getRepoRoot } from "@/lib/git";
import fs from "fs";
import path from "path";

/**
 * POST /api/projects/[name]/sync-workspace
 *
 * Copies the project from the local git working tree into /tmp/oo-workspace so that
 * TexLab (the LSP server) can see the full multi-file project structure for:
 * - Cross-file jump-to-definition and completions
 * - \input{} / \include{} resolution
 * - .bib file indexing
 *
 * Called once when a project is opened in the editor. Returns immediately while
 * the copy runs in the background so the editor does not block.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  const { name: project } = await ctx.params;
  const authResult = requireSession(req as unknown as Request);
  if ("error" in authResult) return authResult.error;

  const sourceDir = path.join(getRepoRoot(), project);
  const destDir = path.join("/tmp/oo-workspace", project);

  setImmediate(() => {
    try {
      if (fs.existsSync(sourceDir)) {
        fs.mkdirSync(destDir, { recursive: true });
        fs.cpSync(sourceDir, destDir, { recursive: true });
      }
    } catch (copyError) {
      console.error("[sync-workspace] Copy failed:", copyError);
    }
  });

  return NextResponse.json({ ok: true });
}
