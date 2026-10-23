import { NextResponse, NextRequest } from "next/server";
import {
  readLocalFile,
  readLocalFileBuffer,
  writeLocalFile,
  deleteLocalPath,
  commitPullAndPush,
  resolveSafeProjectPath,
} from "@/lib/git";
import { requireSession } from "@/lib/session";
import fs from "fs";
import path from "path";

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
};

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
    const ext = path.extname(filePath).toLowerCase();
    const isRaw = url.searchParams.get("raw") === "true";
    const acceptsBinary =
      req.headers.get("accept")?.includes("image/") ||
      req.headers.get("accept")?.includes("application/pdf");

    if (isRaw || acceptsBinary || (MIME_MAP[ext] && url.searchParams.get("json") !== "true")) {
      const buf = readLocalFileBuffer(absolutePath);
      if (buf === null) {
        return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
      }
      const mime = MIME_MAP[ext] || "application/octet-stream";
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": mime,
          "Content-Length": String(buf.length),
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

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
      await commitPullAndPush(`feat: create folder ${project}/${filePath}`, () => {
        fs.mkdirSync(absoluteFolderPath, { recursive: true });
        const gitkeepPath = path.join(absoluteFolderPath, ".gitkeep");
        if (!fs.existsSync(gitkeepPath)) {
          fs.writeFileSync(gitkeepPath, "", "utf-8");
        }
      });
    } else {
      const absolutePath = resolveSafeProjectPath(project, filePath);
      if (fs.existsSync(absolutePath)) {
        return NextResponse.json(
          { ok: false, error: `File "${filePath}" already exists. Use Save (Ctrl+S) to update it.` },
          { status: 409 }
        );
      }
      await commitPullAndPush(`feat: create file ${project}/${filePath}`, () => {
        writeLocalFile(absolutePath, content);
      });
    }

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
    const compileWorkPath = path.join("/tmp/oo-compile", project, filePath);

    await commitPullAndPush(message || `edit: ${project}/${filePath}`, () => {
      writeLocalFile(absolutePath, content);
      try {
        fs.mkdirSync(path.dirname(compileWorkPath), { recursive: true });
        fs.writeFileSync(compileWorkPath, content, "utf-8");
      } catch {}
    });

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
    let pathsToDelete: string[] = [];

    if (filePath) {
      pathsToDelete = [filePath];
    } else {
      try {
        const body = await req.json();
        if (Array.isArray(body?.paths)) {
          pathsToDelete = body.paths.filter((p: unknown): p is string => typeof p === "string" && p.trim().length > 0);
        }
      } catch {
        // Not a JSON body
      }
    }

    if (!pathsToDelete.length) {
      return NextResponse.json({ ok: false, error: "path query or paths array required" }, { status: 400 });
    }

    const commitMsg = pathsToDelete.length === 1
      ? `chore: delete ${project}/${pathsToDelete[0]}`
      : `chore: delete ${pathsToDelete.length} items in ${project}`;

    await commitPullAndPush(commitMsg, () => {
      for (const p of pathsToDelete) {
        const absolutePath = resolveSafeProjectPath(project, p);
        deleteLocalPath(absolutePath);
      }
    });

    return NextResponse.json({ ok: true, count: pathsToDelete.length });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
