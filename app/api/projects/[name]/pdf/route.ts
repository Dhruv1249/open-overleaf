import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import fs from "fs";
import path from "path";

// GET /api/projects/[name]/pdf?mainFile=main.tex&download=1
// Serves the compiled PDF from /tmp/oo-compile/[project]/
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  const { name: project } = await ctx.params;

  const authResult = requireSession(req as unknown as Request);
  if ("error" in authResult) return authResult.error;

  const url = new URL(req.url);
  const mainFile = url.searchParams.get("mainFile") || "main.tex";
  const download = url.searchParams.get("download") === "1";

  // xelatex can output to flat output directory or subfolder
  const pdfName = path.basename(mainFile).replace(/\.tex$/, ".pdf");
  const candidatePaths = [
    path.join("/tmp/oo-compile", project, pdfName),
    path.join("/tmp/oo-compile", project, path.dirname(mainFile), pdfName),
    path.join(process.cwd(), "projects", project, path.dirname(mainFile), pdfName),
    path.join(process.cwd(), "projects", project, pdfName),
    path.join("/app/projects", project, path.dirname(mainFile), pdfName),
    path.join("/app/projects", project, pdfName),
  ];

  let pdfPath = "";
  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      pdfPath = candidate;
      break;
    }
  }

  if (!pdfPath) {
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
