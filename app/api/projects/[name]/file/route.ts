import { NextResponse, NextRequest } from "next/server";
import {
  readLocalFile,
  writeLocalFile,
  deleteLocalPath,
  commitPullAndPush,
  resolveSafeProjectPath,
} from "@/lib/git";
import { requireSession } from "@/lib/session";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  try {
    const authResult = requireSession(req as unknown as Request);
    if ("error" in authResult) return authResult.error;

    const { name: project } = await ctx.params;
    const url = new URL(req.url);
    const filePath = url.searchParams.get("path");
    if (!filePath) {
      return NextResponse.json({ ok: false, error: "path query required" }, { status: 400 });
    }

    const absolutePath = resolveSafeProjectPath(project, filePath);
    const content = readLocalFile(absolutePath);
    if (content === null) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, content });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  try {
    const authResult = requireSession(req as unknown as Request);
    if ("error" in authResult) return authResult.error;

    const { name: project } = await ctx.params;
    const body = await req.json();
    const { path: filePath, content = "", isFolder = false } = body;
    if (!filePath) {
      return NextResponse.json({ ok: false, error: "path required" }, { status: 400 });
    }

    if (isFolder) {
      const absoluteFolderPath = resolveSafeProjectPath(project, filePath);
      fs.mkdirSync(absoluteFolderPath, { recursive: true });
      const gitkeepPath = path.join(absoluteFolderPath, ".gitkeep");
      if (!fs.existsSync(gitkeepPath)) {
        fs.writeFileSync(gitkeepPath, "", "utf-8");
      }
    } else {
      const absolutePath = resolveSafeProjectPath(project, filePath);
      if (fs.existsSync(absolutePath)) {
        return NextResponse.json(
          { ok: false, error: `File "${filePath}" already exists. Use Save (Ctrl+S) to update it.` },
          { status: 409 }
        );
      }
      writeLocalFile(absolutePath, content);
    }

    await commitPullAndPush(`feat: create ${isFolder ? "folder" : "file"} ${project}/${filePath}`);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  try {
    const authResult = requireSession(req as unknown as Request);
    if ("error" in authResult) return authResult.error;

    const { name: project } = await ctx.params;
    const body = await req.json();
    const { path: filePath, content, message } = body;
    if (!filePath || typeof content !== "string") {
      return NextResponse.json({ ok: false, error: "path and content required" }, { status: 400 });
    }

    const absolutePath = resolveSafeProjectPath(project, filePath);
    writeLocalFile(absolutePath, content);

    const compileWorkPath = path.join("/tmp/oo-compile", project, filePath);
    try {
      fs.mkdirSync(path.dirname(compileWorkPath), { recursive: true });
      fs.writeFileSync(compileWorkPath, content, "utf-8");
    } catch {
    }

    await commitPullAndPush(message || `edit: ${project}/${filePath}`);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  try {
    const authResult = requireSession(req as unknown as Request);
    if ("error" in authResult) return authResult.error;

    const { name: project } = await ctx.params;
    const url = new URL(req.url);
    const filePath = url.searchParams.get("path");
    if (!filePath) {
      return NextResponse.json({ ok: false, error: "path query required" }, { status: 400 });
    }

    const absolutePath = resolveSafeProjectPath(project, filePath);
    deleteLocalPath(absolutePath);
    await commitPullAndPush(`chore: delete ${project}/${filePath}`);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
