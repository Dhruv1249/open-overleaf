import { NextResponse, NextRequest } from "next/server";
import {
  listTopLevelDirectories,
  readFileAtPath,
  putFileAtPath,
  getFileMeta,
  deleteDirectoryAtPath,
} from "../../../lib/github";
import { verifySessionFromRequest } from "../../../lib/session";

// GET /api/projects — list all projects (top-level dirs)
export async function GET(req: Request) {
  try {
    const dirs = await listTopLevelDirectories(req);
    const projects = [];
    for (const d of dirs) {
      const manifestPath = `${d.name}/.open-overleaf/project.json`;
      let manifest = null;
      try {
        const content = await readFileAtPath(manifestPath, req);
        if (content) manifest = JSON.parse(content);
      } catch (e) {
        // ignore — no manifest is fine
      }
      projects.push({ name: d.name, manifest });
    }
    return NextResponse.json({ projects });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}

// POST /api/projects — create a new project (top-level directory on GitHub)
// body: { name: string, description?: string }
export async function POST(req: NextRequest) {
  try {
    verifySessionFromRequest(req as unknown as Request);
    const body = await req.json();
    const { name, description = "" } = body;
    if (!name || typeof name !== "string" || !name.trim())
      return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });

    const safeName = name.trim().replace(/[^a-zA-Z0-9_\-. ]/g, "").trim();
    if (!safeName)
      return NextResponse.json({ ok: false, error: "invalid project name" }, { status: 400 });

    // Check if already exists
    try {
      const dirs = await listTopLevelDirectories(req as unknown as Request);
      if (dirs.find((d) => d.name === safeName))
        return NextResponse.json({ ok: false, error: `Project "${safeName}" already exists.` }, { status: 409 });
    } catch { /* ignore */ }

    // Create .gitkeep so the folder exists
    await putFileAtPath(
      `${safeName}/.gitkeep`,
      "",
      `Create project ${safeName}`,
      req as unknown as Request
    );

    // Create default project.json manifest
    const manifest = {
      name: safeName,
      description: description || "",
      branch: process.env.DEFAULT_BRANCH || "main",
      compiler: "xelatex",
      bibliography: "biber",
      autoCompileMode: "debounced",
      debounceSeconds: 2,
    };
    await putFileAtPath(
      `${safeName}/.open-overleaf/project.json`,
      JSON.stringify(manifest, null, 2),
      `Init project manifest for ${safeName}`,
      req as unknown as Request
    );

    return NextResponse.json({ ok: true, name: safeName });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// DELETE /api/projects?name= — delete an entire project directory from GitHub
export async function DELETE(req: NextRequest) {
  try {
    verifySessionFromRequest(req as unknown as Request);
    const url = new URL(req.url);
    const name = url.searchParams.get("name");
    if (!name)
      return NextResponse.json({ ok: false, error: "name query required" }, { status: 400 });

    await deleteDirectoryAtPath(name, req as unknown as Request);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
