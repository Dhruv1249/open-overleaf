import { NextRequest, NextResponse } from "next/server";
import { verifySessionFromRequest } from "@/lib/session";
import { readFileAtPath, putFileAtPath, getFileMeta } from "@/lib/github";

const SETTINGS_FILENAME = ".overleaf.json";

// ── GET /api/projects/[name]/settings ─────────────────────────────────────────
// Returns the project's persisted settings, or defaults if the file doesn't exist yet.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  const { name: project } = await ctx.params;
  try {
    verifySessionFromRequest(req as unknown as Request);
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const raw = await readFileAtPath(
      `${project}/${SETTINGS_FILENAME}`,
      req as unknown as Request
    );
    if (raw) {
      const settings = JSON.parse(raw);
      return NextResponse.json({ ok: true, settings });
    }
  } catch {
    // File doesn't exist yet — return defaults
  }

  return NextResponse.json({ ok: true, settings: null }); // null → caller uses local defaults
}

// ── PUT /api/projects/[name]/settings ─────────────────────────────────────────
// Writes (creates or updates) .overleaf.json in the project root.
// Body: { settings: { engine, mode, intervalSeconds, autoSaveSeconds, mainFile? } }
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  const { name: project } = await ctx.params;
  try {
    verifySessionFromRequest(req as unknown as Request);
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (!body.settings || typeof body.settings !== "object") {
    return NextResponse.json({ ok: false, error: "settings object required" }, { status: 400 });
  }

  const content = JSON.stringify(body.settings, null, 2);
  const filePath = `${project}/${SETTINGS_FILENAME}`;

  // Get current SHA if file already exists (required by GitHub API for updates)
  let sha: string | undefined;
  try {
    const meta = await getFileMeta(filePath, req as unknown as Request);
    sha = meta?.sha;
  } catch {
    // File doesn't exist — first write, no SHA needed
  }

  try {
    await putFileAtPath(
      filePath,
      content,
      `chore: update .overleaf.json`,
      req as unknown as Request,
      sha
    );
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
