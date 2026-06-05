import { NextResponse, NextRequest } from "next/server";
import { listDirectory } from "@/lib/github";
import { verifySessionFromRequest } from "@/lib/session";

export async function GET(req: NextRequest, ctx: any) {
  try {
    verifySessionFromRequest(req as unknown as Request); // ensure authenticated
    const project = ctx.params?.name as string;
    const dir = await listDirectory(encodeURIComponent(project), req as unknown as Request);
    return NextResponse.json({ ok: true, entries: dir });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
