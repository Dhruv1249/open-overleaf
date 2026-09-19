import { NextResponse, NextRequest } from "next/server";
import { listFilesRecursively, resolveSafeProjectPath } from "@/lib/git";
import { requireSession } from "@/lib/session";
import fs from "fs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  try {
    const authResult = requireSession(req as unknown as Request);
    if ("error" in authResult) return authResult.error;

    const { name: project } = await ctx.params;
    const url = new URL(req.url);
    const subPath = url.searchParams.get("path") || "";
    const isRecursive = url.searchParams.get("recursive") === "true";

    const absoluteDir = resolveSafeProjectPath(project, subPath || ".");
    if (!fs.existsSync(absoluteDir)) {
      return NextResponse.json({ ok: true, entries: [] });
    }

    const allEntries = listFilesRecursively(absoluteDir, subPath);

    if (isRecursive) {
      return NextResponse.json({ ok: true, entries: allEntries });
    }

    const directEntries = allEntries.filter((entry) => {
      const entryPathFromProjectRoot = subPath
        ? entry.path.slice(subPath.length + 1)
        : entry.path;
      return !entryPathFromProjectRoot.includes("/");
    });

    return NextResponse.json({ ok: true, entries: directEntries });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
