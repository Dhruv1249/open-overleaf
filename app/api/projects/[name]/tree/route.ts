import { NextResponse, NextRequest } from "next/server";
import { listDirectory } from "@/lib/github";
import { verifySessionFromRequest } from "@/lib/session";

// GET /api/projects/[name]/tree?path=optional/subpath
// Returns entries with paths relative to the project root
export async function GET(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  try {
    verifySessionFromRequest(req as unknown as Request);
    const { name: project } = await ctx.params;
    const url = new URL(req.url);
    const subPath = url.searchParams.get("path") || ""; // e.g. "" | "chapters" | "chapters/sub"

    // Full path within repo: "projectName" or "projectName/subPath"
    const fullDirPath = subPath ? `${project}/${subPath}` : project;
    const rawEntries = await listDirectory(fullDirPath, req as unknown as Request);

    // Normalize: return paths relative to project root, not repo root
    const entries = rawEntries.map((e: any) => ({
      name: e.name,
      path: subPath ? `${subPath}/${e.name}` : e.name,
      type: e.type as "file" | "dir",
    }));

    return NextResponse.json({ ok: true, entries });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
