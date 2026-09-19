import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { getRepoRoot } from "@/lib/git";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

/*
 * Copies all files from the local git working tree into the LaTeX compilation work directory.
 * Client-supplied overrides (unsaved editor content) are applied on top after the copy.
 */
async function syncProjectToDisk(
  project: string,
  destDir: string
): Promise<void> {
  const sourceDir = path.join(getRepoRoot(), project);
  if (fs.existsSync(sourceDir)) {
    fs.mkdirSync(destDir, { recursive: true });
    fs.cpSync(sourceDir, destDir, { recursive: true });
  }
}

// ── Run a process, capture output, resolve with exit code ─────────────────────
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
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

// ── POST /api/projects/[name]/compile ─────────────────────────────────────────
// Body: { mainFile: string }
// Returns: { ok, log, pages? } | { ok: false, error, log? }
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  const { name: project } = await ctx.params;

  const authResult = requireSession(req as unknown as Request);
  if ("error" in authResult) return authResult.error;

  const body = await req.json().catch(() => ({}));
  const mainFile: string = body.mainFile || "main.tex";
  // Engine preference: use what's available; default to pdflatex which is always installed
  const requestedEngine: string = body.engine || "auto";

  // Detect available engines
  const engines = ["xelatex", "pdflatex", "lualatex"];
  const availableEngines = engines.filter(e => fs.existsSync(`/usr/bin/${e}`));
  if (availableEngines.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "No LaTeX compiler found.\nInstall with: sudo pacman -S texlive-basic texlive-latex texlive-latexextra",
    }, { status: 503 });
  }

  // Pick engine: requested → first available
  const engine = requestedEngine !== "auto" && availableEngines.includes(requestedEngine)
    ? requestedEngine
    : (availableEngines.includes("xelatex") ? "xelatex" : availableEngines[0]);
  const enginePath = `/usr/bin/${engine}`;

  const workDir = `/tmp/oo-compile/${project}`;

  try {
    await syncProjectToDisk(project, workDir);

    // Apply client-side overrides (unsaved content from the editor)
    // This lets auto-compile fire without a GitHub save round-trip.
    const overrides: { path: string; content: string }[] = body.overrides || [];
    for (const ov of overrides) {
      const ovPath = path.join(workDir, ov.path);
      fs.mkdirSync(path.dirname(ovPath), { recursive: true });
      fs.writeFileSync(ovPath, ov.content, "utf8");
    }
    const mainFilePath = path.join(workDir, mainFile);
    if (!fs.existsSync(mainFilePath)) {
      return NextResponse.json({
        ok: false,
        error: `Main file "${mainFile}" not found in project "${project}".`,
      }, { status: 404 });
    }

    // ── Step 2: Delete stale PDF, then run LaTeX compiler ──────────────────
    // IMPORTANT: workDir persists between requests. If a previous compile
    // succeeded, the old PDF would still be present. We delete it first so
    // pdfExists is only true when THIS invocation produced a fresh file.
    const pdfName = path.basename(mainFile).replace(/\.tex$/, ".pdf");
    const pdfPath = path.join(workDir, pdfName);
    const subDirPdfPath = path.join(path.dirname(mainFilePath), pdfName);
    try { if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath); } catch {}
    try { if (fs.existsSync(subDirPdfPath)) fs.unlinkSync(subDirPdfPath); } catch {}

    // Use latexmk if available (handles bibtex/biber automatically)
    const latexmkPath = "/usr/bin/latexmk";
    let result: { stdout: string; stderr: string; code: number };

    if (fs.existsSync(latexmkPath)) {
      result = await runProcess(
        latexmkPath,
        [
          `-${engine === "xelatex" ? "xelatex" : engine === "lualatex" ? "lualatex" : "pdf"}`,
          "-interaction=nonstopmode",
          "-file-line-error",
          "-synctex=1",
          `-output-directory=${workDir}`,
          mainFile,
        ],
        workDir,
        90_000
      );
    } else {
      // Direct engine — run twice for cross-references
      const compileArgs = [
        "-interaction=nonstopmode",
        "-file-line-error",
        `-output-directory=${workDir}`,
        mainFile,
      ];
      result = await runProcess(enginePath, compileArgs, workDir, 60_000);
      if (result.code === 0) {
        // Second pass for cross-references
        await runProcess(enginePath, compileArgs, workDir, 60_000);
      }
    }

    const log = (result.stdout + "\n" + result.stderr).trim();

    // Check PDF was produced by THIS compile run (stale files deleted above)
    let pdfExists = fs.existsSync(pdfPath);
    if (!pdfExists && fs.existsSync(subDirPdfPath)) {
      try {
        fs.copyFileSync(subDirPdfPath, pdfPath);
        pdfExists = true;
      } catch {}
    } else if (pdfExists && !fs.existsSync(subDirPdfPath)) {
      try {
        fs.copyFileSync(pdfPath, subDirPdfPath);
      } catch {}
    }

    if (!pdfExists) {
      // Parse errors from log
      const errors = parseLatexErrors(log);
      return NextResponse.json({ ok: false, error: "Compilation failed", errors, log }, { status: 422 });
    }

    const errors = parseLatexErrors(log);
    const warnings = parseLatexWarnings(log);

    return NextResponse.json({
      ok: true,
      pdfFile: pdfName,
      errors: errors.length,
      warnings: warnings.length,
      log,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// ── Parse LaTeX error lines from compile log ──────────────────────────────────
function parseLatexErrors(log: string): Array<{ file: string; line: number; message: string }> {
  const errors: Array<{ file: string; line: number; message: string }> = [];
  const lines = log.split("\n");
  // Pattern: "filename.tex:42: Error message" or "! Error message"
  for (let i = 0; i < lines.length; i++) {
    const fileLineErr = lines[i].match(/^([^:]+\.tex):(\d+):\s*(.+)$/);
    if (fileLineErr) {
      errors.push({ file: fileLineErr[1], line: parseInt(fileLineErr[2]), message: fileLineErr[3].trim() });
      continue;
    }
    if (lines[i].startsWith("!")) {
      errors.push({ file: "", line: 0, message: lines[i].slice(1).trim() });
    }
  }
  return errors.slice(0, 20); // cap at 20
}

function parseLatexWarnings(log: string): string[] {
  return log.split("\n")
    .filter(l => l.toLowerCase().includes("warning"))
    .slice(0, 20);
}
