import { NextResponse, NextRequest } from "next/server";
import { listProjects, resolveSafeProjectPath, commitPullAndPush } from "@/lib/git";
import { requireSession } from "@/lib/session";
import fs from "fs";
import path from "path";

export async function GET(req: Request) {
  try {
    const authResult = requireSession(req);
    if ("error" in authResult) return authResult.error;

    const projects = listProjects().map((name) => {
      const settingsPath = path.join(resolveSafeProjectPath(name, ".overleaf.json"));
      let manifest: object | null = null;
      try {
        if (fs.existsSync(settingsPath)) {
          manifest = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        }
      } catch {
        manifest = null;
      }
      return { name, manifest };
    });

    return NextResponse.json({ projects });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireSession(req as unknown as Request);
    if ("error" in authResult) return authResult.error;

    const body = await req.json();
    const { name, description = "" } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
    }

    const safeName = name.trim().replace(/[^a-zA-Z0-9_\-. ]/g, "").trim();
    if (!safeName) {
      return NextResponse.json({ ok: false, error: "invalid project name" }, { status: 400 });
    }

    const projectPath = resolveSafeProjectPath(safeName, "");
    if (fs.existsSync(projectPath)) {
      return NextResponse.json({ ok: false, error: `Project "${safeName}" already exists.` }, { status: 409 });
    }

    fs.mkdirSync(projectPath, { recursive: true });

    const manifest = {
      name: safeName,
      description,
      branch: process.env.DEFAULT_BRANCH || "main",
      compiler: "xelatex",
      bibliography: "biber",
      autoCompileMode: "debounced",
      debounceSeconds: 2,
    };

    const manifestPath = path.join(projectPath, ".open-overleaf", "project.json");
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

    const gitkeepPath = path.join(projectPath, ".gitkeep");
    fs.writeFileSync(gitkeepPath, "", "utf-8");

    await commitPullAndPush(`feat: create project ${safeName}`);

    return NextResponse.json({ ok: true, name: safeName });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = requireSession(req as unknown as Request);
    if ("error" in authResult) return authResult.error;

    const url = new URL(req.url);
    const name = url.searchParams.get("name");
    if (!name) {
      return NextResponse.json({ ok: false, error: "name query required" }, { status: 400 });
    }

    const projectPath = resolveSafeProjectPath(name, "");
    if (fs.existsSync(projectPath)) {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }

    await commitPullAndPush(`chore: delete project ${name}`);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
