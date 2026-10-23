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

    const moves: { from: string; to: string }[] = Array.isArray(body?.moves)
      ? body.moves.filter((m: any) => m && typeof m.from === "string" && typeof m.to === "string")
      : (body?.from && body?.to)
      ? [{ from: body.from, to: body.to }]
      : [];

    if (!moves.length) {
      return NextResponse.json({ ok: false, error: "from and to paths (or moves array) required" }, { status: 400 });
    }

    let completedCount = 0;
    const commitMsg = moves.length === 1
      ? `refactor: rename ${project}/${moves[0].from} → ${moves[0].to}`
      : `refactor: move ${moves.length} items in ${project}`;

    await commitPullAndPush(commitMsg, () => {
      for (const { from: fromPath, to: toPath } of moves) {
        if (!fromPath || !toPath || fromPath === toPath) continue;

        const absoluteSourcePath = resolveSafeProjectPath(project, fromPath);
        const absoluteDestinationPath = resolveSafeProjectPath(project, toPath);

        if (!fs.existsSync(absoluteSourcePath)) continue;

        fs.mkdirSync(path.dirname(absoluteDestinationPath), { recursive: true });
        fs.renameSync(absoluteSourcePath, absoluteDestinationPath);

        const compileSourcePath = path.join("/tmp/oo-compile", project, fromPath);
        const compileDestinationPath = path.join("/tmp/oo-compile", project, toPath);
        try {
          if (fs.existsSync(compileSourcePath)) {
            fs.mkdirSync(path.dirname(compileDestinationPath), { recursive: true });
            fs.renameSync(compileSourcePath, compileDestinationPath);
          }
        } catch {}
        completedCount++;
      }
    });

    if (completedCount === 0) {
      return NextResponse.json({ ok: false, error: "No files were moved" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, count: completedCount });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
