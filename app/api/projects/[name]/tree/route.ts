import { NextResponse, NextRequest } from "next/server";
import { listDirectory } from "@/lib/github";
import { requireSession } from "@/lib/session";

async function getRecursiveEntries(
  project: string,
  subPath: string,
  req: Request
): Promise<Array<{ name: string; path: string; type: "file" | "dir" }>> {
  const fullDirPath = subPath ? `${project}/${subPath}` : project;
  const rawEntries = await listDirectory(fullDirPath, req);
  const results: Array<{ name: string; path: string; type: "file" | "dir" }> = [];
  for (const e of rawEntries) {
    if (e.name === ".open-overleaf" || e.path?.includes("/.open-overleaf") || e.name === ".git") continue;
    const relPath = subPath ? `${subPath}/${e.name}` : e.name;
    results.push({
      name: e.name,
      path: relPath,
      type: e.type as "file" | "dir",
    });
    if (e.type === "dir") {
      const sub = await getRecursiveEntries(project, relPath, req);
      results.push(...sub);
    }
  }
  return results;
}

// GET /api/projects/[name]/tree?path=optional/subpath&recursive=true
// Returns entries with paths relative to the project root
export async function GET(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  try {
    const authResult = requireSession(req as unknown as Request);
    if ("error" in authResult) return authResult.error;
    const { name: project } = await ctx.params;
    const url = new URL(req.url);
    const subPath = url.searchParams.get("path") || "";
    const isRecursive = url.searchParams.get("recursive") === "true";

    if (isRecursive) {
      const entries = await getRecursiveEntries(project, subPath, req as unknown as Request);
      return NextResponse.json({ ok: true, entries });
    }

    // Full path within repo: "projectName" or "projectName/subPath"
    const fullDirPath = subPath ? `${project}/${subPath}` : project;
    const rawEntries = await listDirectory(fullDirPath, req as unknown as Request);

    // Normalize: return paths relative to project root, not repo root
    // Filter out the hidden .open-overleaf metadata directory
    const entries = rawEntries
      .filter((e: any) => e.name !== ".open-overleaf" && !e.path?.includes("/.open-overleaf"))
      .map((e: any) => ({
        name: e.name,
        path: subPath ? `${subPath}/${e.name}` : e.name,
        type: e.type as "file" | "dir",
      }));

    return NextResponse.json({ ok: true, entries });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

