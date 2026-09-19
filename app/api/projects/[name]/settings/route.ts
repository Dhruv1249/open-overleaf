import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { readLocalFile, writeLocalFile, commitPullAndPush, resolveSafeProjectPath } from "@/lib/git";

const SETTINGS_FILENAME = ".overleaf.json";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  const { name: project } = await ctx.params;
  const authResult = requireSession(req as unknown as Request);
  if ("error" in authResult) return authResult.error;

  try {
    const absolutePath = resolveSafeProjectPath(project, SETTINGS_FILENAME);
    const raw = readLocalFile(absolutePath);
    if (raw) {
      const settings = JSON.parse(raw);
      return NextResponse.json({ ok: true, settings });
    }
  } catch {
    // File doesn't exist yet or is malformed — return null
  }

  return NextResponse.json({ ok: true, settings: null });
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  const { name: project } = await ctx.params;
  const authResult = requireSession(req as unknown as Request);
  if ("error" in authResult) return authResult.error;

  const body = await req.json().catch(() => ({}));
  if (!body.settings || typeof body.settings !== "object") {
    return NextResponse.json({ ok: false, error: "settings object required" }, { status: 400 });
  }

  try {
    const absolutePath = resolveSafeProjectPath(project, SETTINGS_FILENAME);
    const content = JSON.stringify(body.settings, null, 2);
    writeLocalFile(absolutePath, content);
    await commitPullAndPush(`chore: update .overleaf.json for ${project}`);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
