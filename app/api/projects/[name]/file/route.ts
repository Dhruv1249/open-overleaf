import { NextResponse, NextRequest } from "next/server";
import { readFileAtPath, getFileMeta, putFileAtPath } from "@/lib/github";
import { verifySessionFromRequest } from "@/lib/session";

export async function GET(req: NextRequest, ctx: any) {
  try {
    verifySessionFromRequest(req as unknown as Request);
    const project = ctx.params?.name as string;
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

export async function PUT(req: NextRequest, ctx: any) {
  try {
    verifySessionFromRequest(req as unknown as Request);
    const project = ctx.params?.name as string;
    const body = await req.json();
    const { path: filePath, content, message } = body;
    if (!filePath || typeof content !== "string") return NextResponse.json({ ok: false, error: "path and content required" }, { status: 400 });
    const fullPath = `${project}/${filePath}`;
    let sha: string | undefined = undefined;
    try {
      const meta = await getFileMeta(fullPath, req as unknown as Request);
      if (meta && meta.sha) sha = meta.sha;
    } catch (e) {
      // ignore, creating new file
    }
    const res = await putFileAtPath(fullPath, content, message || `Edit ${filePath}`, req as unknown as Request, sha);
    return NextResponse.json({ ok: true, result: res });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
