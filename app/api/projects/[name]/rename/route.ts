import { NextResponse, NextRequest } from "next/server";
import {
  resolveSafeProjectPath,
  commitPullAndPush,
} from "@/lib/git";
import { requireSession } from "@/lib/session";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  try {
    const authResult = requireSession(req as unknown as Request);
    if ("error" in authResult) return authResult.error;

    const { name: project } = await ctx.params;
    const body = await req.json();
    const { from: fromPath, to: toPath } = body;

    if (!fromPath || !toPath) {
      return NextResponse.json({ ok: false, error: "from and to paths required" }, { status: 400 });
    }
    if (fromPath === toPath) {
      return NextResponse.json({ ok: false, error: "from and to are the same" }, { status: 400 });
    }

    const absoluteSourcePath = resolveSafeProjectPath(project, fromPath);
    const absoluteDestinationPath = resolveSafeProjectPath(project, toPath);

    if (!fs.existsSync(absoluteSourcePath)) {
      return NextResponse.json({ ok: false, error: `Source not found: ${fromPath}` }, { status: 404 });
    }

    fs.mkdirSync(path.dirname(absoluteDestinationPath), { recursive: true });
    fs.renameSync(absoluteSourcePath, absoluteDestinationPath);

    const compileSourcePath = path.join("/tmp/oo-compile", project, fromPath);
    const compileDestinationPath = path.join("/tmp/oo-compile", project, toPath);
    try {
      if (fs.existsSync(compileSourcePath)) {
        fs.mkdirSync(path.dirname(compileDestinationPath), { recursive: true });
        fs.renameSync(compileSourcePath, compileDestinationPath);
      }
    } catch {
    }

    await commitPullAndPush(`refactor: rename ${project}/${fromPath} → ${toPath}`);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
