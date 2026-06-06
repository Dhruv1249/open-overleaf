import { NextRequest, NextResponse } from "next/server";
import { verifySessionFromRequest } from "@/lib/session";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

function runProcess(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const proc = spawn(cmd, args, { cwd, env: { ...process.env, PATH: `/usr/bin:/usr/local/bin:${process.env.PATH}` } });
    const timer = setTimeout(() => { proc.kill("SIGKILL"); }, timeoutMs);
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => { clearTimeout(timer); resolve({ stdout, stderr, code: code ?? 1 }); });
  });
}

// ── POST /api/projects/[name]/preview-at-sha ──────────────────────────────────
// Compiles a historical version of a single .tex file.
// Reuses the current project workspace (for aux files, images, bib) but
// overrides the target file with the historical content.
// Body: { content: string, mainFile: string, sha: string, engine?: string }
// Returns: { ok, pdfKey } where pdfKey is used to GET the PDF
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  const { name: project } = await ctx.params;

  try { verifySessionFromRequest(req as unknown as Request); }
  catch { return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }); }

  const body        = await req.json().catch(() => ({}));
  const content: string  = body.content ?? "";
  const mainFile: string = body.mainFile ?? "main.tex";
  const sha: string      = (body.sha ?? "preview").slice(0, 7);
  const engine: string   = body.engine ?? "auto";

  // Preview workspace is separate from the main compile workspace
  const srcDir     = `/tmp/oo-compile/${project}`;   // existing workspace (has aux files)
  const previewDir = `/tmp/oo-preview/${project}-${sha}`;

  // Detect engines
  const availableEngines = ["xelatex", "pdflatex", "lualatex"].filter(e => fs.existsSync(`/usr/bin/${e}`));
  if (availableEngines.length === 0) {
    return NextResponse.json({ ok: false, error: "No LaTeX compiler found" }, { status: 503 });
  }
  const chosenEngine = engine !== "auto" && availableEngines.includes(engine)
    ? engine
    : (availableEngines.includes("xelatex") ? "xelatex" : availableEngines[0]);

  // Create preview dir and seed it from the current workspace (if available)
  fs.mkdirSync(previewDir, { recursive: true });
  if (fs.existsSync(srcDir)) {
    // Copy everything except .pdf (we'll generate a fresh one)
    copyDirExclude(srcDir, previewDir, [".pdf"]);
  }

  // Override the main .tex file with historical content
  const mainFilePath = path.join(previewDir, mainFile);
  fs.mkdirSync(path.dirname(mainFilePath), { recursive: true });
  fs.writeFileSync(mainFilePath, content, "utf8");

  // Delete stale PDF
  const pdfName = path.basename(mainFile).replace(/\.tex$/, ".pdf");
  const pdfPath = path.join(previewDir, pdfName);
  try { if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath); } catch {}

  // Compile
  const latexmkPath = "/usr/bin/latexmk";
  let result: { stdout: string; stderr: string; code: number };

  if (fs.existsSync(latexmkPath)) {
    result = await runProcess(
      latexmkPath,
      [
        `-${chosenEngine === "xelatex" ? "xelatex" : chosenEngine === "lualatex" ? "lualatex" : "pdf"}`,
        "-interaction=nonstopmode",
        "-file-line-error",
        `-output-directory=${previewDir}`,
        mainFile,
      ],
      previewDir,
      90_000
    );
  } else {
    const args = [
      "-interaction=nonstopmode",
      "-file-line-error",
      `-output-directory=${previewDir}`,
      mainFile,
    ];
    result = await runProcess(`/usr/bin/${chosenEngine}`, args, previewDir, 60_000);
    if (result.code === 0) await runProcess(`/usr/bin/${chosenEngine}`, args, previewDir, 60_000);
  }

  if (!fs.existsSync(pdfPath)) {
    const log = (result.stdout + "\n" + result.stderr).trim();
    return NextResponse.json({ ok: false, error: "Compilation failed", log }, { status: 422 });
  }

  return NextResponse.json({ ok: true, pdfKey: sha, pdfName });
}

// ── GET /api/projects/[name]/preview-at-sha?key=<sha7>&file=<pdfName> ─────────
// Serves the compiled PDF from the preview workspace.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  const { name: project } = await ctx.params;

  try { verifySessionFromRequest(req as unknown as Request); }
  catch { return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }); }

  const url  = new URL(req.url);
  const key  = url.searchParams.get("key") ?? "";
  const file = url.searchParams.get("file") ?? "main.pdf";

  // Sanitise: no path traversal
  const safeName = path.basename(file);
  const pdfPath  = `/tmp/oo-preview/${project}-${key}/${safeName}`;

  if (!fs.existsSync(pdfPath)) {
    return NextResponse.json({ ok: false, error: "Preview not found" }, { status: 404 });
  }

  const buf = fs.readFileSync(pdfPath);
  return new NextResponse(buf, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control":       "no-store",
    },
  });
}

// ── Helper: copy a directory recursively, skipping certain extensions ──────────
function copyDirExclude(src: string, dest: string, excludeExts: string[]) {
  if (!fs.existsSync(src)) return;
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirExclude(srcPath, destPath, excludeExts);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (!excludeExts.includes(ext)) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}
