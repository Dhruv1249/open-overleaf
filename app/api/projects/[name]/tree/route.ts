import { NextResponse, NextRequest } from "next/server";
import { listDirectory } from "@/lib/github";
import { requireSession } from "@/lib/session";
import fs from "fs";
import path from "path";

async function getRecursiveEntries(
  project: string,
  subPath: string,
  req: Request
): Promise<Array<{ name: string; path: string; type: "file" | "dir" }>> {
  const fullDirPath = subPath ? `${project}/${subPath}` : project;
  let rawEntries: any[] = [];
  try {
    rawEntries = await listDirectory(fullDirPath, req);
  } catch {
    rawEntries = [];
  }

  const candidateLocalDirs = [
    path.join(process.cwd(), "projects", project, subPath),
    path.join("/app/projects", project, subPath),
    path.join("/tmp/oo-compile", project, subPath),
  ];

  for (const localDir of candidateLocalDirs) {
    if (fs.existsSync(localDir) && fs.statSync(localDir).isDirectory()) {
      try {
        const localItems = fs.readdirSync(localDir, { withFileTypes: true });
        for (const item of localItems) {
          if (item.name.startsWith(".") || item.name.startsWith("temp-") || item.name.endsWith(".pdf") || item.name.endsWith(".aux") || item.name.endsWith(".log") || item.name.endsWith(".out") || item.name.endsWith(".fls") || item.name.endsWith(".fdb_latexmk") || item.name.endsWith(".synctex.gz") || item.name.endsWith(".xdv") || item.name.endsWith(".toc") || item.name.endsWith(".nav") || item.name.endsWith(".snm") || item.name.endsWith(".bcf") || item.name.endsWith(".run.xml")) continue;
          if (!rawEntries.some(e => e.name === item.name)) {
            rawEntries.push({
              name: item.name,
              path: subPath ? `${project}/${subPath}/${item.name}` : `${project}/${item.name}`,
              type: item.isDirectory() ? "dir" : "file",
            });
          }
        }
      } catch {}
    }
  }

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

    const entries = await getRecursiveEntries(project, subPath, req as unknown as Request);
    if (isRecursive) {
      return NextResponse.json({ ok: true, entries });
    }

    // Top-level only
    const directEntries = entries.filter(e => {
      if (!subPath) return !e.path.includes("/");
      const rest = e.path.slice(subPath.length + 1);
      return !rest.includes("/");
    });

    return NextResponse.json({ ok: true, entries: directEntries });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

