import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { execFileAsync, resolveSafePath } from "../git.ts";
import type { ToolDefinition, DiagnosticItem } from "../types.ts";

const INTERNAL_APP_URL = process.env.INTERNAL_APP_URL || `http://127.0.0.1:${process.env.PORT || "8080"}`;

function getEffectiveMCPToken(): string {
  if (process.env.OVERLEAF_MCP_TOKEN) {
    return process.env.OVERLEAF_MCP_TOKEN;
  }
  const secretString = process.env.OVERLEAF_MCP_SECRET || process.env.SESSION_SECRET || "open_overleaf_mcp_secret";
  let ghTokenHash = process.env.GITHUB_TOKEN_HASH || "";
  if (!ghTokenHash) {
    const rawSecret = process.env.GITHUB_CLIENT_SECRET || "default_gh_token";
    ghTokenHash = crypto.createHash("sha256").update(rawSecret).digest("hex");
  }
  const repoName = process.env.GITHUB_SINGLE_REPO_NAME || "overleaf-projects";
  const rawCombined = `${secretString}:${ghTokenHash}:${repoName}`;
  return crypto.createHash("sha256").update(rawCombined).digest("hex");
}

function buildInternalHeaders(): Record<string, string> {
  let activeToken = "";
  try {
    activeToken = getEffectiveMCPToken();
  } catch {
    activeToken = process.env.SESSION_SECRET || "";
  }
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${activeToken}`,
    "x-internal-mcp": "true",
    "x-internal-token": activeToken,
  };
}

export async function getPDFPageCount(pdfFilePath: string): Promise<number> {
  if (!fs.existsSync(pdfFilePath)) {
    return 0;
  }
  try {
    const { stdout } = await execFileAsync("pdfinfo", [pdfFilePath]);
    const pageMatch = stdout.match(/Pages:\s+(\d+)/);
    if (pageMatch) {
      return parseInt(pageMatch[1], 10);
    }
  } catch {
    return 0;
  }
  return 0;
}

export function parseLatexDiagnostics(log: string): { errors: DiagnosticItem[]; warnings: DiagnosticItem[] } {
  const errors: DiagnosticItem[] = [];
  const warnings: DiagnosticItem[] = [];
  const lines = log.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // File:line: error pattern (e.g. ./main.tex:42: Undefined control sequence.)
    const fileLineMatch = line.match(/^(?:(?:\.\/)?([a-zA-Z0-9_\-./]+\.(?:tex|sty|cls|bib))):(\d+):\s*(.+)$/);
    if (fileLineMatch) {
      errors.push({
        file: fileLineMatch[1],
        line: parseInt(fileLineMatch[2], 10),
        message: fileLineMatch[3].trim(),
      });
      continue;
    }

    // ! Error pattern (standard TeX panic)
    if (line.startsWith("! ")) {
      const nextLine = lines[i + 1]?.trim();
      errors.push({
        message: line.slice(2).trim(),
        detail: nextLine && !nextLine.startsWith("l.") ? nextLine : undefined,
      });
      continue;
    }

    // LaTeX Warnings
    if (line.includes("Warning:")) {
      const warnMatch = line.match(/Warning:\s*(.+?)(?: on input line (\d+))?\.?$/);
      warnings.push({
        type: "LaTeX Warning",
        message: warnMatch ? warnMatch[1] : line.trim(),
        line: warnMatch?.[2] ? parseInt(warnMatch[2], 10) : undefined,
      });
      continue;
    }

    // Overfull / Underfull hbox / vbox
    if (line.startsWith("Overfull \\") || line.startsWith("Underfull \\")) {
      const boxMatch = line.match(/^(Overfull|Underfull)\s*(\\[hv]box)\s*\((.+?)\)(?: in paragraph at lines (\d+)--(\d+))?/);
      warnings.push({
        type: `${boxMatch ? boxMatch[1] : ""} ${boxMatch ? boxMatch[2] : ""}`.trim(),
        message: line.trim(),
        line: boxMatch?.[4] ? parseInt(boxMatch[4], 10) : undefined,
        detail: boxMatch?.[3],
      });
      continue;
    }
  }

  return { errors: errors.slice(0, 30), warnings: warnings.slice(0, 30) };
}

export const compileToolDefinitions: ToolDefinition[] = [
  {
    name: "compile_project",
    description: "Compiles a LaTeX document and returns structured diagnostics (page count, parsed errors, and warnings) with automatic multi-pass reference convergence.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        mainFile: { type: "string", description: "Entry .tex file to compile (default: main.tex)" },
        engine: { type: "string", enum: ["auto", "pdflatex", "xelatex", "lualatex"], description: "Compilation engine (default: auto)" },
        maxRuns: { type: "number", description: "Maximum compilation passes to resolve cross-references (default: 2, max: 4)" },
        includeFullLog: { type: "boolean", description: "Whether to return the complete raw stdout log (default: false to save tokens; use get_compilation_log if needed)" },
      },
      required: ["projectName"],
    },
  },
  {
    name: "clean_build_artifacts",
    description: "Cleans cached auxiliary build files (.aux, .toc, .out, .log, .fls, .fdb_latexmk, .bcf, .run.xml, .bbl) to resolve corrupted cross-reference caches and stale compilation crashes.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        removePdf: { type: "boolean", description: "Also delete the generated .pdf file (default: false)" },
      },
      required: ["projectName"],
    },
  },
  {
    name: "preview_tikz",
    description: "Compiles an isolated TikZ snippet or standalone diagram in under 1 second and saves an instant PNG image preview. Avoids recompiling entire large documents when tuning diagrams.",
    inputSchema: {
      type: "object",
      properties: {
        snippet: { type: "string", description: "TikZ code snippet (e.g. \\begin{tikzpicture} ... \\end{tikzpicture} or \\tikz{...})" },
        libraries: { type: "string", description: "Comma-separated list of additional TikZ libraries (e.g. 'arrows.meta,positioning,calc')" },
        engine: { type: "string", enum: ["pdflatex", "xelatex"], description: "Compiler engine (default: pdflatex)" },
        dpi: { type: "number", description: "Resolution DPI of rendered PNG (default: 150)" },
      },
      required: ["snippet"],
    },
  },
  {
    name: "get_compilation_log",
    description: "Retrieves the compilation log from the last compile run for a project.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        lines: { type: "number", description: "Number of lines from end of log (default: all)" },
      },
      required: ["projectName"],
    },
  },
];

export async function handleCompileTool(name: string, args: Record<string, any>): Promise<any> {
  if (name === "compile_project") {
    const projectName = String(args?.projectName);
    const entryFilename = String(args?.mainFile || "main.tex");
    const engineName = String(args?.engine || "auto");
    const maxRuns = Math.min(Math.max(parseInt(String(args?.maxRuns || "2"), 10), 1), 4);
    const includeFullLog = Boolean(args?.includeFullLog);

    let result: any = null;
    let runsCompleted = 0;
    let lastLog = "";

    for (let run = 1; run <= maxRuns; run++) {
      runsCompleted = run;
      try {
        const response = await fetch(`${INTERNAL_APP_URL}/api/projects/${encodeURIComponent(projectName)}/compile`, {
          method: "POST",
          headers: buildInternalHeaders(),
          body: JSON.stringify({ mainFile: entryFilename, engine: engineName }),
        });
        result = await response.json().catch(() => ({}));
        if (!response.ok && response.status !== 422) {
          throw new Error(`Compile request failed (HTTP ${response.status}): ${result?.error || JSON.stringify(result)}`);
        }
      } catch (fetchErr: any) {
        if (!result) throw fetchErr;
      }

      lastLog = result?.log ?? "";

      // Check if reference convergence requires another pass
      const needsRerun =
        lastLog.includes("Rerun to get cross-references right") ||
        lastLog.includes("Label(s) may have changed") ||
        lastLog.includes("Please rerun LaTeX");

      if (!needsRerun || run >= maxRuns || !result?.ok) {
        break;
      }
    }

    const compiledPdfName = result?.pdfFile || entryFilename.replace(/\.tex$/i, ".pdf");
    let localPdfPath = path.join("/tmp/oo-compile", projectName, compiledPdfName);
    if (!fs.existsSync(localPdfPath)) {
      const fallbackPath = path.join("/tmp/oo-compile", projectName, entryFilename.replace(/\.tex$/i, ".pdf"));
      if (fs.existsSync(fallbackPath)) {
        localPdfPath = fallbackPath;
      }
    }
    const calculatedPageCount = fs.existsSync(localPdfPath) ? await getPDFPageCount(localPdfPath) : 0;
    const { errors, warnings } = parseLatexDiagnostics(lastLog);

    const logLines = lastLog.split("\n");
    const rawLogSnippet = logLines.slice(Math.max(0, logLines.length - 45)).join("\n");

    const isSuccess = Boolean(result?.ok);
    const summary = isSuccess
      ? `Compilation succeeded in ${runsCompleted} run(s) (${calculatedPageCount} page(s), ${warnings.length} warning(s))`
      : `Compilation failed with ${errors.length || 1} error(s)`;

    return {
      status: isSuccess ? "compiled" : "failed",
      engine: engineName,
      pdfFile: result?.pdfFile ?? compiledPdfName,
      pdfPath: result?.pdfFile ?? compiledPdfName,
      pageCount: calculatedPageCount,
      errorCount: errors.length || (isSuccess ? 0 : 1),
      warningCount: warnings.length,
      errors: errors.length > 0 ? errors : (isSuccess ? [] : [{ message: result?.error || "Compilation failed" }]),
      warnings,
      summary,
      runsCompleted,
      rawLogSnippet,
      ...(includeFullLog ? { outputLog: lastLog, log: lastLog } : {}),
    };
  }

  if (name === "clean_build_artifacts") {
    const projectName = String(args?.projectName);
    const removePdf = Boolean(args?.removePdf);

    const extensionsToClean = [
      ".aux", ".toc", ".out", ".log", ".fls", ".fdb_latexmk",
      ".bcf", ".run.xml", ".bbl", ".blg", ".synctex.gz", ".xdv",
      ".nav", ".snm", ".vrb",
    ];
    if (removePdf) extensionsToClean.push(".pdf");

    const dirsToCheck = [
      path.join("/tmp/oo-compile", projectName),
      resolveSafePath(projectName, "."),
    ];

    const removedFiles: string[] = [];

    for (const dir of dirsToCheck) {
      if (!fs.existsSync(dir)) continue;
      const cleanDir = (curDir: string) => {
        for (const entry of fs.readdirSync(curDir, { withFileTypes: true })) {
          const fullPath = path.join(curDir, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith(".")) {
            cleanDir(fullPath);
          } else if (!entry.isDirectory()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (extensionsToClean.includes(ext)) {
              try {
                fs.unlinkSync(fullPath);
                removedFiles.push(entry.name);
              } catch {}
            }
          }
        }
      };
      cleanDir(dir);
    }

    return {
      success: true,
      message: `Cleaned ${removedFiles.length} build artifact(s) for project ${projectName}`,
      removedCount: removedFiles.length,
      cleanedCount: removedFiles.length,
      cleanedFiles: removedFiles,
      cleanedExtensions: extensionsToClean,
    };
  }

  if (name === "preview_tikz") {
    const snippet = String(args?.snippet || "").trim();
    if (!snippet) throw new Error("snippet cannot be empty");

    const extraLibs = String(args?.libraries || "arrows.meta,calc,positioning,shapes").trim();
    const engine = String(args?.engine || "pdflatex");
    const dpi = Math.min(Math.max(parseInt(String(args?.dpi || "150"), 10), 72), 300);

    const tmpDir = "/tmp/oo-tikz";
    fs.mkdirSync(tmpDir, { recursive: true });

    const hash = crypto.createHash("md5").update(snippet).digest("hex").slice(0, 10);
    const texPath = path.join(tmpDir, `tikz_${hash}.tex`);
    const pdfPath = path.join(tmpDir, `tikz_${hash}.pdf`);
    const pngPrefix = path.join(tmpDir, `tikz_${hash}`);

    const standaloneDoc = `\\documentclass[tikz,border=4pt]{standalone}
\\usepackage{amsmath,amssymb}
\\usepackage{tikz}
\\usetikzlibrary{${extraLibs}}
\\begin{document}
${snippet}
\\end{document}
`;

    fs.writeFileSync(texPath, standaloneDoc, "utf-8");

    try {
      await execFileAsync(engine === "xelatex" ? "xelatex" : "pdflatex", [
        "-interaction=nonstopmode",
        `-output-directory=${tmpDir}`,
        texPath,
      ]);
    } catch (compileErr: any) {
      const logPath = path.join(tmpDir, `tikz_${hash}.log`);
      const logContent = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf-8") : compileErr.message;
      const { errors } = parseLatexDiagnostics(logContent);
      throw new Error(`TikZ compilation failed: ${errors[0]?.message || compileErr.message}`);
    }

    if (!fs.existsSync(pdfPath)) {
      throw new Error("TikZ PDF was not produced");
    }

    await execFileAsync("pdftoppm", [
      "-png", "-r", String(dpi),
      "-f", "1", "-l", "1",
      pdfPath, pngPrefix,
    ]);

    const generatedPng = `${pngPrefix}-1.png`;
    const fallbackPng = `${pngPrefix}-01.png`;
    const finalPng = fs.existsSync(generatedPng) ? generatedPng : fallbackPng;

    if (!fs.existsSync(finalPng)) {
      throw new Error("Failed to rasterize TikZ preview to PNG");
    }

    return {
      success: true,
      previewPath: finalPng,
      engine,
      dpi,
      message: "TikZ preview generated successfully in < 1s",
    };
  }

  if (name === "get_compilation_log") {
    const projectName = String(args?.projectName);
    const maxLines = args?.lines ? parseInt(String(args.lines), 10) : undefined;
    const logPath = path.join("/tmp/oo-compile", projectName, "compile.log");

    let logText = "";
    if (fs.existsSync(logPath)) {
      logText = fs.readFileSync(logPath, "utf-8");
    } else {
      const altLog = path.join("/tmp/oo-compile", projectName, "main.log");
      if (fs.existsSync(altLog)) {
        logText = fs.readFileSync(altLog, "utf-8");
      }
    }

    if (!logText) {
      return { log: "No compilation log available for this project. Compile the project first." };
    }

    if (maxLines && maxLines > 0) {
      const lines = logText.split("\n");
      logText = lines.slice(Math.max(0, lines.length - maxLines)).join("\n");
    }

    return { log: logText, totalLines: logText.split("\n").length };
  }

  throw new Error(`Unknown compile tool: ${name}`);
}
