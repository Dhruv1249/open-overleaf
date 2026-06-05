import { NextRequest, NextResponse } from "next/server";
import { verifySessionFromRequest } from "@/lib/session";
import { listDirectory } from "@/lib/github";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

// ── Binary file extensions that need raw buffer treatment ─────────────────────
const BINARY_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp",
  ".pdf", ".eps", ".ps",
  ".ttf", ".otf", ".woff", ".woff2",
  ".zip", ".tar", ".gz",
]);

function isBinary(filename: string): boolean {
  return BINARY_EXTS.has(path.extname(filename).toLowerCase());
}

// ── GitHub file fetch (returns raw Buffer — handles both text and binary) ─────
async function fetchGitHubFileBuffer(
  repoPath: string,
  token: string | undefined
): Promise<Buffer | null> {
  const owner = process.env.GITHUB_SINGLE_REPO_OWNER;
  const repo  = process.env.GITHUB_SINGLE_REPO_NAME;
  const branch = process.env.DEFAULT_BRANCH || "main";
  const encoded = repoPath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encoded}?ref=${branch}`;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `token ${token}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (data?.content != null) return Buffer.from(data.content, "base64");
  return null;
}

// ── Recursively sync all project files to local disk ─────────────────────────
async function syncProjectToDisk(
  project: string,
  token: string | undefined,
  req: Request,
  destDir: string
): Promise<void> {
  async function syncDir(ghDirPath: string, localDir: string) {
    fs.mkdirSync(localDir, { recursive: true });
    const entries = await listDirectory(ghDirPath, req);
    await Promise.all(
      entries.map(async (entry: { name: string; path: string; type: string }) => {
        const localPath = path.join(localDir, entry.name);
        if (entry.type === "dir") {
          await syncDir(entry.path, localPath);
        } else {
          const buf = await fetchGitHubFileBuffer(entry.path, token);
          if (buf !== null) {
            fs.mkdirSync(path.dirname(localPath), { recursive: true });
            fs.writeFileSync(localPath, buf);
          }
        }
      })
    );
  }
  await syncDir(project, destDir);
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

  let session: any;
  try {
    session = verifySessionFromRequest(req as unknown as Request);
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

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
    // ── Step 1: Sync all project files from GitHub ──────────────────────────
    const token = (session as any)?.access_token as string | undefined;
    await syncProjectToDisk(project, token, req as unknown as Request, workDir);

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

    // ── Step 2: Run LaTeX compiler ──────────────────────────────────────────
    // Two passes: first for initial compilation, second for cross-references
    const compileArgs = [
      `-${engine}`,
      "-interaction=nonstopmode",
      "-file-line-error",
      `-output-directory=${workDir}`,
      mainFile,
    ];

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

    // Check PDF was produced
    // xelatex always writes the PDF as basename-only inside -output-directory
    // e.g. mainFile="ytfc/sdfasd.tex" → PDF at workDir/sdfasd.pdf, NOT workDir/ytfc/sdfasd.pdf
    const pdfName = path.basename(mainFile).replace(/\.tex$/, ".pdf");
    const pdfPath = path.join(workDir, pdfName);
    const pdfExists = fs.existsSync(pdfPath);

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
