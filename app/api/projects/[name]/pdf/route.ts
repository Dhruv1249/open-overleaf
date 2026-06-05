import { NextRequest, NextResponse } from "next/server";
import { verifySessionFromRequest } from "@/lib/session";
import fs from "fs";
import path from "path";

// GET /api/projects/[name]/pdf?mainFile=main.tex&download=1
// Serves the compiled PDF from /tmp/oo-compile/[project]/
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

  const url = new URL(req.url);
  const mainFile = url.searchParams.get("mainFile") || "main.tex";
  const download = url.searchParams.get("download") === "1";

  // xelatex always outputs to the flat output-directory (basename only)
  const pdfName = path.basename(mainFile).replace(/\.tex$/, ".pdf");
  const pdfPath = path.join("/tmp/oo-compile", project, pdfName);

  if (!fs.existsSync(pdfPath)) {
    return NextResponse.json(
      { ok: false, error: "PDF not found. Compile first." },
      { status: 404 }
    );
  }

  const data = fs.readFileSync(pdfPath);
  const disposition = download
    ? `attachment; filename="${pdfName}"`
    : `inline; filename="${pdfName}"`;

  return new NextResponse(data, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Length":      String(data.length),
      "Content-Disposition": disposition,
      "Cache-Control":       "no-cache, no-store, must-revalidate",
      "Pragma":              "no-cache",
    },
  });
}
