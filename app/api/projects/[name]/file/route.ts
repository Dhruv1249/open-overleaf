import { NextResponse, NextRequest } from "next/server";
import {
  readFileAtPath,
  getFileMeta,
  putFileAtPath,
  deleteFileAtPath,
  deleteDirectoryAtPath,
  listDirectory,
} from "@/lib/github";
import { verifySessionFromRequest } from "@/lib/session";

// GET /api/projects/[name]/file?path= — read file content
export async function GET(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  try {
    verifySessionFromRequest(req as unknown as Request);
    const { name: project } = await ctx.params;
    const url = new URL(req.url);
    const filePath = url.searchParams.get("path");
    if (!filePath) return NextResponse.json({ ok: false, error: "path query required" }, { status: 400 });
    const fullPath = `${project}/${filePath}`;
    const content = await readFileAtPath(fullPath, req as unknown as Request);
    if (content === null) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, content });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// POST /api/projects/[name]/file — create new file (or folder via .gitkeep)
// body: { path: string, content?: string, isFolder?: boolean }
export async function POST(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  try {
    verifySessionFromRequest(req as unknown as Request);
    const { name: project } = await ctx.params;
    const body = await req.json();
    const { path: filePath, content = "", isFolder = false } = body;
    if (!filePath) return NextResponse.json({ ok: false, error: "path required" }, { status: 400 });

    const targetPath = isFolder
      ? `${project}/${filePath}/.gitkeep`
      : `${project}/${filePath}`;

    // For files: check if already exists to give a better error than GitHub's 422
    if (!isFolder) {
      try {
        const meta = await getFileMeta(targetPath, req as unknown as Request);
        if (meta?.sha) {
          return NextResponse.json(
            { ok: false, error: `File "${filePath}" already exists. Use Save (Ctrl+S) to update it.` },
            { status: 409 }
          );
        }
      } catch {
        // Expected — file doesn't exist yet, proceed to create
      }
    }

    const res = await putFileAtPath(
      targetPath,
      isFolder ? "" : content,
      isFolder ? `Create folder ${filePath}` : `Create ${filePath}`,
      req as unknown as Request
    );
    return NextResponse.json({ ok: true, result: res });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// PUT /api/projects/[name]/file — update existing file content
// body: { path: string, content: string, message?: string }
export async function PUT(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  try {
    verifySessionFromRequest(req as unknown as Request);
    const { name: project } = await ctx.params;
    const body = await req.json();
    const { path: filePath, content, message } = body;
    if (!filePath || typeof content !== "string")
      return NextResponse.json({ ok: false, error: "path and content required" }, { status: 400 });
    const fullPath = `${project}/${filePath}`;
    let sha: string | undefined = undefined;
    try {
      const meta = await getFileMeta(fullPath, req as unknown as Request);
      if (meta && meta.sha) sha = meta.sha;
    } catch {
      // ignore — creating new file
    }
    const res = await putFileAtPath(fullPath, content, message || `Edit ${filePath}`, req as unknown as Request, sha);
    return NextResponse.json({ ok: true, result: res });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// DELETE /api/projects/[name]/file?path=&type=file|dir — delete a file or directory
// Directories are deleted recursively (GitHub has no directory-delete API).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  try {
    verifySessionFromRequest(req as unknown as Request);
    const { name: project } = await ctx.params;
    const url = new URL(req.url);
    const filePath = url.searchParams.get("path");
    const entryType = url.searchParams.get("type") || "file"; // "file" | "dir"
    if (!filePath) return NextResponse.json({ ok: false, error: "path query required" }, { status: 400 });
    const fullPath = `${project}/${filePath}`;

    if (entryType === "dir") {
      // Recursive directory deletion
      await deleteDirectoryAtPath(fullPath, req as unknown as Request);
      return NextResponse.json({ ok: true });
    } else {
      // Single file deletion
      const meta = await getFileMeta(fullPath, req as unknown as Request);
      if (!meta?.sha) return NextResponse.json({ ok: false, error: "file not found or no sha" }, { status: 404 });
      const res = await deleteFileAtPath(fullPath, `Delete ${filePath}`, meta.sha, req as unknown as Request);
      return NextResponse.json({ ok: true, result: res });
    }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
