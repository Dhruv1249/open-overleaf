import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { exec } from "child_process";
import { promisify } from "util";

import jwt from "jsonwebtoken";
import * as crypto from "crypto";

const execAsync = promisify(exec);
const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(process.cwd(), "projects");
const LOCAL_REPO_DIR = process.env.LOCAL_REPO_DIR || "/tmp/oo-repo-cache";
const MCP_PORT = parseInt(process.env.MCP_PORT || "3202", 10);

/**
 * Clones the single GitHub repo locally on demand, and pulls latest updates to prevent rate limits.
 */
async function ensureLocalRepoClone(userGhToken?: string): Promise<string> {
  const owner = process.env.GITHUB_SINGLE_REPO_OWNER;
  const repoName = process.env.GITHUB_SINGLE_REPO_NAME;
  const branch = process.env.DEFAULT_BRANCH || "main";
  if (!owner || !repoName) {
    throw new Error("GITHUB_SINGLE_REPO_OWNER and GITHUB_SINGLE_REPO_NAME must be set");
  }

  const cloneUrl = userGhToken
    ? `https://${userGhToken}@github.com/${owner}/${repoName}.git`
    : `https://github.com/${owner}/${repoName}.git`;

  fs.mkdirSync(LOCAL_REPO_DIR, { recursive: true });

  if (!fs.existsSync(path.join(LOCAL_REPO_DIR, ".git"))) {
    await execAsync(`git clone --depth=1 --branch ${branch} "${cloneUrl}" .`, { cwd: LOCAL_REPO_DIR });
  } else {
    const pullUrl = userGhToken
      ? `https://${userGhToken}@github.com/${owner}/${repoName}.git`
      : "origin";
    try {
      await execAsync(`git pull "${pullUrl}" ${branch}`, { cwd: LOCAL_REPO_DIR });
    } catch {
      // If pull fails (e.g. because of local changes, though there shouldn't be any), try resetting or ignore
    }
  }

  return LOCAL_REPO_DIR;
}

/**
 * Computes or retrieves the active MCP authentication token.
 * Uses OVERLEAF_MCP_TOKEN if set, otherwise derives SHA-256 hash of secret + ghTokenHash + repoName.
 */
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

/**
 * Diagnostic error detail extracted from LaTeX log output.
 */
interface DiagnosticError {
  line?: number;
  message: string;
  snippet?: string;
}

/**
 * Structured diagnostics result parsed from TeX compilation logs.
 */
interface TeXDiagnostics {
  hasErrors: boolean;
  errors: DiagnosticError[];
  missingPackages: string[];
}

/**
 * Validates and resolves project file paths to prevent directory traversal outside PROJECTS_DIR.
 */
function resolveSafePath(projectName: string, filePath: string): string {
  const resolvedProjectFolder = path.resolve(PROJECTS_DIR, projectName);
  const resolvedTargetFile = path.resolve(resolvedProjectFolder, filePath);

  if (!resolvedTargetFile.startsWith(resolvedProjectFolder)) {
    throw new Error(`Security Violation: Access denied for path ${filePath}`);
  }

  return resolvedTargetFile;
}

/**
 * Parses raw LaTeX stdout and stderr logs into structured error line numbers and messages.
 */
function parseTeXDiagnostics(stdoutOutput: string, stderrOutput: string): TeXDiagnostics {
  const errorList: DiagnosticError[] = [];
  const missingPackageSet = new Set<string>();

  const logLines = (stdoutOutput + "\n" + stderrOutput).split("\n");
  for (let index = 0; index < logLines.length; index++) {
    const currentLine = logLines[index];

    if (currentLine.startsWith("! ")) {
      const errorMessage = currentLine.substring(2).trim();
      let lineNumber: number | undefined = undefined;
      let codeSnippet = "";

      for (let lookahead = 1; lookahead <= 5 && index + lookahead < logLines.length; lookahead++) {
        const nextLine = logLines[index + lookahead];
        const lineMatch = nextLine.match(/^l\.(\d+)/);
        if (lineMatch) {
          lineNumber = parseInt(lineMatch[1], 10);
          codeSnippet = nextLine.trim();
          break;
        }
      }

      errorList.push({
        line: lineNumber,
        message: errorMessage,
        snippet: codeSnippet,
      });
    }

    const packageMatch = currentLine.match(/LaTeX Error: File `([^']+)' not found/);
    if (packageMatch) {
      missingPackageSet.add(packageMatch[1]);
    }
  }

  return {
    hasErrors: errorList.length > 0,
    errors: errorList,
    missingPackages: Array.from(missingPackageSet),
  };
}

/**
 * Inspects compiled PDF using pdfinfo to count total rendered pages.
 */
async function getPDFPageCount(pdfFilePath: string): Promise<number> {
  if (!fs.existsSync(pdfFilePath)) {
    return 0;
  }

  try {
    const { stdout } = await execAsync(`pdfinfo "${pdfFilePath}"`);
    const pageMatch = stdout.match(/Pages:\s+(\d+)/);
    if (pageMatch) {
      return parseInt(pageMatch[1], 10);
    }
  } catch {
    return 0;
  }

  return 0;
}
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const INTERNAL_APP_URL = process.env.INTERNAL_APP_URL || `http://127.0.0.1:${process.env.PORT || "8080"}`;

/**
 * Generates a JWT system cookie for Next.js Web UI API calls, embedding the caller's specific GitHub access_token if provided.
 */
function getSystemAuthCookie(userAccessToken?: string): string {
  const payload: any = {
    username: process.env.ALLOW_GITHUB_USERNAME || "Dhruv1249",
  };
  if (userAccessToken) {
    payload.access_token = userAccessToken;
  }
  const token = jwt.sign(payload, SESSION_SECRET);
  return `oo_session=${token}`;
}

/**
 * Calls Next.js Web UI API endpoints using the caller's specific GitHub token for persistent GitHub synchronization.
 */
async function syncWithWebUIAPI(method: string, apiPath: string, body?: any, userAccessToken?: string): Promise<any> {
  const response = await fetch(`${INTERNAL_APP_URL}${apiPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: getSystemAuthCookie(userAccessToken),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false || data?.error) {
    throw new Error(`GitHub Sync ${method} ${apiPath} failed (HTTP ${response.status}): ${data?.error || JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Core execution engine carrying out individual MCP tool logic.
 */
async function executeMCPTool(name: string, toolArguments: Record<string, any>): Promise<any> {
  const userGhToken = toolArguments?.githubToken ? String(toolArguments.githubToken) : undefined;

  if (name === "list_projects") {
    if (!fs.existsSync(PROJECTS_DIR)) {
      fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    }
    const localEntries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    let ghProjects: string[] = [];
    try {
      const webUiRes = await syncWithWebUIAPI("GET", "/api/projects", undefined, userGhToken);
      if (Array.isArray(webUiRes?.projects)) {
        ghProjects = webUiRes.projects.map((item: any) => item.name);
      }
    } catch {
      // Ignore list projects error
    }

    const mergedProjects = Array.from(new Set([...localEntries, ...ghProjects]));
    return { projects: mergedProjects };
  }

  if (name === "list_files") {
    const projectName = String(toolArguments?.projectName);
    const subDirectory = String(toolArguments?.subDir || "");
    const queryString = subDirectory ? `?path=${encodeURIComponent(subDirectory)}` : "";
    const result = await syncWithWebUIAPI(
      "GET",
      `/api/projects/${encodeURIComponent(projectName)}/tree${queryString}`,
      undefined,
      userGhToken
    );
    return { files: result.entries };
  }

  if (name === "read_project_file") {
    const projectName = String(toolArguments?.projectName);
    const filePath = String(toolArguments?.filePath);
    const result = await syncWithWebUIAPI(
      "GET",
      `/api/projects/${encodeURIComponent(projectName)}/file?path=${encodeURIComponent(filePath)}`,
      undefined,
      userGhToken
    );
    return { content: result.content };
  }

  if (name === "read_file_lines") {
    const projectName = String(toolArguments?.projectName);
    const filePath = String(toolArguments?.filePath);
    const startLineNumber = parseInt(toolArguments?.startLine || "1", 10);
    const endLineNumber = parseInt(toolArguments?.endLine || "100", 10);

    const result = await syncWithWebUIAPI(
      "GET",
      `/api/projects/${encodeURIComponent(projectName)}/file?path=${encodeURIComponent(filePath)}`,
      undefined,
      userGhToken
    );
    const fullContent = result.content || "";
    const contentLines = fullContent.split("\n");

    const slicedLines = contentLines.slice(
      Math.max(0, startLineNumber - 1),
      Math.min(contentLines.length, endLineNumber)
    );

    return {
      filePath: filePath,
      startLine: startLineNumber,
      endLine: endLineNumber,
      totalLines: contentLines.length,
      linesContent: slicedLines.join("\n"),
    };
  }

  if (name === "write_project_file") {
    const projectName = String(toolArguments?.projectName);
    const filePath = String(toolArguments?.filePath);
    const fileContentString = String(toolArguments?.content);
    if (!userGhToken) {
      throw new Error("write_project_file requires a githubToken argument — provide a fine-grained PAT with Contents read+write on the target repo");
    }
    const targetFullPath = resolveSafePath(projectName, filePath);

    // 1. Write locally for instant TeX compilation
    fs.mkdirSync(path.dirname(targetFullPath), { recursive: true });
    fs.writeFileSync(targetFullPath, fileContentString, "utf-8");

    // 2. If user provided a githubToken, await GitHub API sync synchronously
    let ghSyncMessage = "";
    if (userGhToken) {
      // Ensure project exists on GitHub (ignore 409 conflict if already exists)
      try {
        await syncWithWebUIAPI("POST", "/api/projects", { name: projectName }, userGhToken);
      } catch (projErr: any) {
        if (!projErr.message.includes("already exists")) {
          throw projErr;
        }
      }

      await syncWithWebUIAPI("PUT", `/api/projects/${encodeURIComponent(projectName)}/file`, {
        path: filePath,
        content: fileContentString,
        message: `MCP: write ${filePath}`,
      }, userGhToken);
      ghSyncMessage = " and committed to GitHub";
    }

    return { message: `Successfully wrote ${filePath} in project ${projectName}${ghSyncMessage}` };
  }

  if (name === "delete_file") {
    const projectName = String(toolArguments?.projectName);
    const filePath = String(toolArguments?.filePath);
    const targetFullPath = resolveSafePath(projectName, filePath);

    if (fs.existsSync(targetFullPath)) {
      const stats = fs.statSync(targetFullPath);
      if (stats.isDirectory()) {
        fs.rmSync(targetFullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(targetFullPath);
      }
    }

    if (userGhToken) {
      await syncWithWebUIAPI("DELETE", `/api/projects/${encodeURIComponent(projectName)}/file?path=${encodeURIComponent(filePath)}&type=file`, undefined, userGhToken);
    }

    return { message: `Successfully deleted ${filePath} in project ${projectName}` };
  }

  if (name === "sync_to_drive") {
    const projectName = String(toolArguments?.projectName);
    const mainFile = String(toolArguments?.mainFile || "main.tex");
    const result = await syncWithWebUIAPI(
      "POST",
      "/api/drive/sync",
      { project: projectName, mainFile },
      userGhToken
    );
    return {
      driveUrl: result.webViewLink,
      fileId: result.fileId,
      drivePath: result.drivePath,
    };
  }

  if (name === "compile_project") {
    const projectName = String(toolArguments?.projectName);
    const engineName = String(toolArguments?.engine || "xelatex");
    const entryFilename = String(toolArguments?.entryFile || "main.tex");

    const result = await syncWithWebUIAPI(
      "POST",
      `/api/projects/${encodeURIComponent(projectName)}/compile`,
      { mainFile: entryFilename, engine: engineName },
      userGhToken
    );

    return {
      status: result.ok ? "compiled" : "failed",
      engine: engineName,
      pdfFile: result.pdfFile ?? "",
      errorCount: result.errors ?? 0,
      warningCount: result.warnings ?? 0,
      log: result.log ?? "",
    };
  }

  if (name === "get_project_pdf") {
    const projectName = String(toolArguments?.projectName);
    const pdfFilename = String(toolArguments?.pdfName || "main.pdf");
    const texName = pdfFilename.replace(/\.pdf$/i, ".tex");
    const pdfResponse = await fetch(
      `${INTERNAL_APP_URL}/api/projects/${encodeURIComponent(projectName)}/pdf?mainFile=${encodeURIComponent(texName)}`,
      { headers: { Cookie: getSystemAuthCookie(userGhToken) } }
    );
    if (!pdfResponse.ok) {
      throw new Error(`PDF not found for project ${projectName} — compile first`);
    }
    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
    const base64DataString = pdfBuffer.toString("base64");

    const tempDir = path.join("/tmp/oo-compile", projectName);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempPdfPath = path.join(tempDir, `temp-${Date.now()}-${pdfFilename}`);
    fs.writeFileSync(tempPdfPath, pdfBuffer);
    const totalPages = await getPDFPageCount(tempPdfPath);
    try { fs.unlinkSync(tempPdfPath); } catch {}

    return {
      fileName: pdfFilename,
      mimeType: "application/pdf",
      pageCount: totalPages,
      base64Data: base64DataString,
      sizeBytes: pdfBuffer.length,
    };
  }

  if (name === "get_project_preview_image") {
    const projectName = String(toolArguments?.projectName);
    const pdfFilename = String(toolArguments?.pdfName || "main.pdf");
    const targetPageNumber = parseInt(toolArguments?.pageNumber || "1", 10);
    const resolutionDPI = parseInt(toolArguments?.dpi || "150", 10);

    const pdfFullPath = path.join("/tmp/oo-compile", projectName, pdfFilename);
    if (!fs.existsSync(pdfFullPath)) {
      throw new Error(`PDF artifact not found: ${pdfFilename} in project ${projectName} — compile first`);
    }

    const temporaryOutputPrefix = path.join("/tmp/oo-compile", projectName, `preview_p${targetPageNumber}`);
    const pdftoppmCommand = `pdftoppm -png -r ${resolutionDPI} -f ${targetPageNumber} -l ${targetPageNumber} "${pdfFullPath}" "${temporaryOutputPrefix}"`;

    await execAsync(pdftoppmCommand);

    const expectedPngPath = `${temporaryOutputPrefix}-${targetPageNumber}.png`;
    const fallbackPngPath = `${temporaryOutputPrefix}-01.png`;
    const finalPngPath = fs.existsSync(expectedPngPath) ? expectedPngPath : fallbackPngPath;

    if (!fs.existsSync(finalPngPath)) {
      throw new Error(`Failed generating PNG preview image for page ${targetPageNumber}`);
    }

    const imageBuffer = fs.readFileSync(finalPngPath);
    const imageBase64String = imageBuffer.toString("base64");

    fs.unlinkSync(finalPngPath);

    return {
      fileName: `${path.basename(pdfFilename, ".pdf")}_p${targetPageNumber}.png`,
      mimeType: "image/png",
      pageNumber: targetPageNumber,
      base64Data: imageBase64String,
      sizeBytes: imageBuffer.length,
    };
  }

  if (name === "create_project") {
    const projectName = String(toolArguments?.projectName);
    const description = String(toolArguments?.description || "");
    if (!userGhToken) throw new Error("create_project requires a githubToken");
    const result = await syncWithWebUIAPI(
      "POST",
      "/api/projects",
      { name: projectName, description },
      userGhToken
    );
    return { ok: result.ok, name: result.name };
  }

  if (name === "delete_project") {
    const projectName = String(toolArguments?.projectName);
    if (!userGhToken) throw new Error("delete_project requires a githubToken");
    await syncWithWebUIAPI(
      "DELETE",
      `/api/projects?name=${encodeURIComponent(projectName)}`,
      undefined,
      userGhToken
    );
    return { message: `Project ${projectName} permanently deleted from GitHub` };
  }

  if (name === "rename_file") {
    const projectName = String(toolArguments?.projectName);
    const fromPath = String(toolArguments?.fromPath);
    const toPath = String(toolArguments?.toPath);
    if (!userGhToken) throw new Error("rename_file requires a githubToken");
    await syncWithWebUIAPI(
      "POST",
      `/api/projects/${encodeURIComponent(projectName)}/rename`,
      { from: fromPath, to: toPath },
      userGhToken
    );
    return { message: `Renamed ${fromPath} → ${toPath} in project ${projectName}` };
  }

  if (name === "get_project_settings") {
    const projectName = String(toolArguments?.projectName);
    const result = await syncWithWebUIAPI(
      "GET",
      `/api/projects/${encodeURIComponent(projectName)}/settings`,
      undefined,
      userGhToken
    );
    return { settings: result.settings };
  }

  if (name === "update_project_settings") {
    const projectName = String(toolArguments?.projectName);
    const settings = toolArguments?.settings;
    if (!settings || typeof settings !== "object") throw new Error("settings object required");
    if (!userGhToken) throw new Error("update_project_settings requires a githubToken");
    await syncWithWebUIAPI(
      "PUT",
      `/api/projects/${encodeURIComponent(projectName)}/settings`,
      { settings },
      userGhToken
    );
    return { message: `Settings updated for project ${projectName}` };
  }

  if (name === "get_file_history") {
    const projectName = String(toolArguments?.projectName);
    const filePath = String(toolArguments?.filePath);
    const perPage = Math.min(parseInt(toolArguments?.perPage || "30", 10), 100);
    const result = await syncWithWebUIAPI(
      "GET",
      `/api/projects/${encodeURIComponent(projectName)}/history?path=${encodeURIComponent(filePath)}&per_page=${perPage}`,
      undefined,
      userGhToken
    );
    return { commits: result.commits };
  }

  if (name === "get_file_at_revision") {
    const projectName = String(toolArguments?.projectName);
    const filePath = String(toolArguments?.filePath);
    const sha = String(toolArguments?.sha);
    const result = await syncWithWebUIAPI(
      "GET",
      `/api/projects/${encodeURIComponent(projectName)}/history?path=${encodeURIComponent(filePath)}&sha=${encodeURIComponent(sha)}`,
      undefined,
      userGhToken
    );
    return { content: result.content, sha };
  }

  if (name === "get_compilation_log") {
    const projectName = String(toolArguments?.projectName);
    const logFilename = String(toolArguments?.logFile || "main.log");
    const logFilePath = path.join("/tmp/oo-compile", projectName, logFilename);
    if (!fs.existsSync(logFilePath)) {
      throw new Error(`Log not found: ${logFilename} — compile project first`);
    }
    const fullContent = fs.readFileSync(logFilePath, "utf-8");
    const allLines = fullContent.split("\n");
    const startLine = parseInt(toolArguments?.startLine || "1", 10);
    const endLine = parseInt(toolArguments?.endLine || String(allLines.length), 10);
    const slicedLines = allLines.slice(Math.max(0, startLine - 1), Math.min(allLines.length, endLine));
    return {
      logFile: logFilename,
      totalLines: allLines.length,
      startLine,
      endLine,
      content: slicedLines.join("\n"),
    };
  }

  if (name === "search_in_project") {
    const projectName = String(toolArguments?.projectName);
    const query = String(toolArguments?.query);
    const filePattern = String(toolArguments?.filePattern || "");
    const caseSensitive = toolArguments?.caseSensitive !== false;

    const repoDir = await ensureLocalRepoClone(userGhToken);
    const projectDir = path.join(repoDir, projectName);

    if (!fs.existsSync(projectDir)) {
      throw new Error(`Project ${projectName} not found in repo`);
    }

    const caseFlag = caseSensitive ? "" : "-i";
    const includeFlag = filePattern ? `--include="${filePattern}"` : "";
    const grepCmd = `grep -rn ${caseFlag} ${includeFlag} ${JSON.stringify(query)} .`;

    let grepOutput = "";
    try {
      const result = await execAsync(grepCmd, { cwd: projectDir });
      grepOutput = result.stdout;
    } catch (grepError: any) {
      grepOutput = grepError.stdout || "";
    }

    const matches = grepOutput.split("\n")
      .filter(Boolean)
      .map((line) => {
        const colonIndex = line.indexOf(":");
        const afterFirst = line.indexOf(":", colonIndex + 1);
        if (colonIndex === -1 || afterFirst === -1) return null;
        return {
          file: line.slice(0, colonIndex),
          line: parseInt(line.slice(colonIndex + 1, afterFirst), 10),
          content: line.slice(afterFirst + 1).trim(),
        };
      })
      .filter(Boolean);

    return { totalMatches: matches.length, matches };
  }

  if (name === "validate_tex") {
    const projectName = String(toolArguments?.projectName);
    const filePath = String(toolArguments?.filePath);

    const repoDir = await ensureLocalRepoClone(userGhToken);
    const texFilePath = path.join(repoDir, projectName, filePath);

    if (!fs.existsSync(texFilePath)) {
      throw new Error(`File not found: ${filePath} in project ${projectName}`);
    }

    let chktexOutput = "";
    try {
      const result = await execAsync(`chktex -q "${texFilePath}"`);
      chktexOutput = result.stdout + result.stderr;
    } catch (chktexError: any) {
      chktexOutput = (chktexError.stdout || "") + (chktexError.stderr || "");
      if (chktexOutput.includes("not found") || chktexOutput.includes("command not found")) {
        return { available: false, message: "chktex is not installed in this environment" };
      }
    }

    const diagnostics = chktexOutput.split("\n")
      .filter(Boolean)
      .map((diagLine) => {
        const match = diagLine.match(/^(.+):(\d+):(\d+):\s*(Warning|Error)\s+\d+\s+in .+ -- (.+)$/);
        if (!match) return null;
        return {
          severity: match[4].toLowerCase(),
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          message: match[5].trim(),
        };
      })
      .filter(Boolean);

    return { available: true, filePath, totalDiagnostics: diagnostics.length, diagnostics };
  }

  if (name === "apply_patch") {
    const projectName = String(toolArguments?.projectName);
    const filePath = String(toolArguments?.filePath);
    const patches = toolArguments?.patches;

    if (!userGhToken) throw new Error("apply_patch requires a githubToken");
    if (!Array.isArray(patches) || patches.length === 0) {
      throw new Error("patches array must be provided and non-empty");
    }

    // 1. Fetch current file content from GitHub
    const fileResult = await syncWithWebUIAPI(
      "GET",
      `/api/projects/${encodeURIComponent(projectName)}/file?path=${encodeURIComponent(filePath)}`,
      undefined,
      userGhToken
    );

    const originalText: string = fileResult.content || "";
    const lines = originalText.split("\n");

    // 2. Apply patches in reverse order (by startLine descending) to prevent line shifting issues
    const sortedPatches = [...patches].sort((a, b) => b.startLine - a.startLine);

    for (const patch of sortedPatches) {
      const { startLine, endLine, originalContent, newContent } = patch;
      if (startLine < 1 || endLine > lines.length || startLine > endLine) {
        throw new Error(`Invalid line range: [${startLine}, ${endLine}]. File has ${lines.length} lines.`);
      }

      // Check content match in lines [startLine - 1, endLine]
      const actualBlock = lines.slice(startLine - 1, endLine).join("\n");
      if (actualBlock.trim() !== originalContent.trim()) {
        throw new Error(
          `Validation failed for line range [${startLine}, ${endLine}]. ` +
          `Expected:\n"${originalContent}"\nBut found:\n"${actualBlock}"`
        );
      }

      // Perform replacement
      const replacementLines = newContent.split("\n");
      lines.splice(startLine - 1, endLine - startLine + 1, ...replacementLines);
    }

    const updatedContent = lines.join("\n");

    // 3. Write locally for instant compile/TexLab update
    const targetFullPath = resolveSafePath(projectName, filePath);
    fs.mkdirSync(path.dirname(targetFullPath), { recursive: true });
    fs.writeFileSync(targetFullPath, updatedContent, "utf-8");

    // 4. Commit updated file back to GitHub
    await syncWithWebUIAPI(
      "PUT",
      `/api/projects/${encodeURIComponent(projectName)}/file`,
      {
        path: filePath,
        content: updatedContent,
        message: `MCP: apply targeted patches to ${filePath}`,
      },
      userGhToken
    );

    return { success: true, message: `Successfully applied ${patches.length} patch(es) to ${filePath}` };
  }

  throw new Error(`Unknown MCP tool requested: ${name}`);
}

/**
 * Initializes and configures the Model Context Protocol Server with LaTeX management tools.
 */
function createMCPServer(): Server {
  const serverInstance = new Server(
    {
      name: "open-overleaf-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  serverInstance.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "list_projects",
          description: "Lists all LaTeX projects stored in open-overleaf.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "list_files",
          description: "Lists files and directories inside a target LaTeX project by fetching the repository tree from GitHub.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              subDir: { type: "string", description: "Optional sub-directory path relative to project root", default: "" },
              githubToken: { type: "string", description: "Fine-grained GitHub PAT with Contents read access on the sync repo" },
            },
            required: ["projectName"],
          },
        },
        {
          name: "read_project_file",
          description: "Reads a .tex or text file from an open-overleaf project in GitHub.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              filePath: { type: "string", description: "Relative file path inside project" },
              githubToken: { type: "string", description: "Fine-grained GitHub PAT with Contents read access on the sync repo" },
            },
            required: ["projectName", "filePath"],
          },
        },
        {
          name: "read_file_lines",
          description: "Reads specific line ranges [startLine, endLine] from a file in GitHub.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              filePath: { type: "string", description: "Relative file path inside project" },
              startLine: { type: "integer", description: "1-indexed starting line", default: 1 },
              endLine: { type: "integer", description: "1-indexed ending line", default: 100 },
              githubToken: { type: "string", description: "Fine-grained GitHub PAT with Contents read access on the sync repo" },
            },
            required: ["projectName", "filePath"],
          },
        },
        {
          name: "write_project_file",
          description: "Writes or updates a file in an open-overleaf project and commits it to GitHub. Requires a githubToken.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              filePath: { type: "string", description: "Relative file path inside project" },
              content: { type: "string", description: "Updated file content" },
              githubToken: { type: "string", description: "Fine-grained GitHub PAT with Contents read+write on the sync repo" },
            },
            required: ["projectName", "filePath", "content", "githubToken"],
          },
        },
        {
          name: "delete_file",
          description: "Deletes a specific file or folder inside a target project on GitHub.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              filePath: { type: "string", description: "Relative path to file/folder for deletion" },
              githubToken: { type: "string", description: "Fine-grained GitHub PAT with Contents read+write on the sync repo" },
            },
            required: ["projectName", "filePath"],
          },
        },
        {
          name: "sync_to_drive",
          description: "Synchronizes the compiled PDF of the project to Google Drive and returns a stable webViewLink.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              mainFile: { type: "string", description: "The main .tex file name to identify compiled PDF", default: "main.tex" },
              githubToken: { type: "string", description: "Fine-grained GitHub PAT with Contents read access on the sync repo" },
            },
            required: ["projectName"],
          },
        },
        {
          name: "compile_project",
          description: "Triggers LaTeX compilation for an open-overleaf project on the backend, fetching fresh files from GitHub.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              engine: { type: "string", description: "Compilation engine: xelatex, pdflatex, lualatex", default: "xelatex" },
              entryFile: { type: "string", description: "Target tex file to compile", default: "main.tex" },
              githubToken: { type: "string", description: "Fine-grained GitHub PAT with Contents read access on the sync repo" },
            },
            required: ["projectName"],
          },
        },
        {
          name: "get_project_pdf",
          description: "Retrieves compiled PDF document as base64 encoded binary data.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              pdfName: { type: "string", description: "PDF filename to retrieve", default: "main.pdf" },
              githubToken: { type: "string", description: "Fine-grained GitHub PAT with Contents read access on the sync repo" },
            },
            required: ["projectName"],
          },
        },
        {
          name: "get_project_preview_image",
          description: "Converts a specified PDF page to PNG preview image (base64 string).",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              pdfName: { type: "string", description: "PDF filename", default: "main.pdf" },
              pageNumber: { type: "integer", description: "Page number to render", default: 1 },
              dpi: { type: "integer", description: "Image resolution DPI", default: 150 },
            },
            required: ["projectName"],
          },
        },
        {
          name: "create_project",
          description: "Creates a new project folder on GitHub with a default gitkeep and settings manifest. Requires a githubToken.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the project directory to create" },
              description: { type: "string", description: "Optional project description" },
              githubToken: { type: "string", description: "Fine-grained GitHub PAT with Contents read+write on the sync repo" },
            },
            required: ["projectName", "githubToken"],
          },
        },
        {
          name: "delete_project",
          description: "Irreversibly deletes an entire project directory and all its files from GitHub. Requires a githubToken.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the project directory to delete" },
              githubToken: { type: "string", description: "Fine-grained GitHub PAT with Contents read+write on the sync repo" },
            },
            required: ["projectName", "githubToken"],
          },
        },
        {
          name: "rename_file",
          description: "Renames/moves a file or directory in GitHub via copy-then-delete. Requires a githubToken.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the project" },
              fromPath: { type: "string", description: "Old relative file/directory path inside project" },
              toPath: { type: "string", description: "New relative file/directory path inside project" },
              githubToken: { type: "string", description: "Fine-grained GitHub PAT with Contents read+write on the sync repo" },
            },
            required: ["projectName", "fromPath", "toPath", "githubToken"],
          },
        },
        {
          name: "get_project_settings",
          description: "Gets the project settings manifest (.overleaf.json) from GitHub.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the project" },
              githubToken: { type: "string", description: "Fine-grained GitHub PAT with Contents read access on the sync repo" },
            },
            required: ["projectName"],
          },
        },
        {
          name: "update_project_settings",
          description: "Updates the project settings manifest (.overleaf.json) in GitHub. Requires a githubToken.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the project" },
              settings: {
                type: "object",
                properties: {
                  engine: { type: "string", enum: ["xelatex", "pdflatex", "lualatex"] },
                  mainFile: { type: "string" },
                  mode: { type: "string" },
                },
                description: "Settings object containing keys like engine, mainFile, mode",
              },
              githubToken: { type: "string", description: "Fine-grained GitHub PAT with Contents read+write on the sync repo" },
            },
            required: ["projectName", "settings", "githubToken"],
          },
        },
        {
          name: "get_file_history",
          description: "Gets commit history for a specific file in a project from GitHub.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the project" },
              filePath: { type: "string", description: "Relative file path inside project" },
              perPage: { type: "integer", description: "Maximum number of history items to fetch", default: 30 },
              githubToken: { type: "string", description: "Fine-grained GitHub PAT with Contents read access on the sync repo" },
            },
            required: ["projectName", "filePath"],
          },
        },
        {
          name: "get_file_at_revision",
          description: "Retrieves the content of a file at a specific commit SHA from GitHub.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the project" },
              filePath: { type: "string", description: "Relative file path inside project" },
              sha: { type: "string", description: "Commit SHA" },
              githubToken: { type: "string", description: "Fine-grained GitHub PAT with Contents read access on the sync repo" },
            },
            required: ["projectName", "filePath", "sha"],
          },
        },
        {
          name: "get_compilation_log",
          description: "Reads the compilation log file (main.log) from local backend directory.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the project" },
              logFile: { type: "string", description: "Name of log file, defaults to main.log", default: "main.log" },
              startLine: { type: "integer", description: "1-indexed starting line to slice", default: 1 },
              endLine: { type: "integer", description: "1-indexed ending line to slice" },
            },
            required: ["projectName"],
          },
        },
        {
          name: "search_in_project",
          description: "Performs full-text search across project files using a locally cached git clone.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the project" },
              query: { type: "string", description: "String to search for" },
              filePattern: { type: "string", description: "Glob pattern to filter files, e.g., *.tex" },
              caseSensitive: { type: "boolean", description: "Whether grep should be case-sensitive", default: true },
              githubToken: { type: "string", description: "Fine-grained GitHub PAT for authentication with the git clone" },
            },
            required: ["projectName", "query"],
          },
        },
        {
          name: "validate_tex",
          description: "Runs chktex to lint a LaTeX file and retrieve syntax warning/error diagnostics.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the project" },
              filePath: { type: "string", description: "Relative file path inside project" },
              githubToken: { type: "string", description: "Fine-grained GitHub PAT for authentication with the git clone" },
            },
            required: ["projectName", "filePath"],
          },
        },
        {
          name: "apply_patch",
          description: "Applies targeted chunk-based replacements to a file on GitHub without transferring the whole file.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the project" },
              filePath: { type: "string", description: "Relative file path inside project" },
              githubToken: { type: "string", description: "Fine-grained GitHub PAT with Contents read+write access" },
              patches: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    startLine: { type: "integer", description: "1-indexed starting line number of the block to replace" },
                    endLine: { type: "integer", description: "1-indexed ending line number of the block to replace" },
                    originalContent: { type: "string", description: "The exact content expected in the target file at those lines" },
                    newContent: { type: "string", description: "The replacement content" },
                  },
                  required: ["startLine", "endLine", "originalContent", "newContent"],
                },
                description: "List of patch chunks to apply",
              },
            },
            required: ["projectName", "filePath", "githubToken", "patches"],
          },
        },
      ],
    };
  });

  serverInstance.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: toolArguments } = request.params;
    try {
      const resultData = await executeMCPTool(name, toolArguments || {});
      return {
        content: [{ type: "text", text: JSON.stringify(resultData) }],
      };
    } catch (handlerError: any) {
      return {
        content: [{ type: "text", text: `Error executing tool ${name}: ${handlerError.message}` }],
        isError: true,
      };
    }
  });

  return serverInstance;
}

const activeSseTransportsMap = new Map<string, SSEServerTransport>();

/**
 * Handles HTTP Tool Execution requests and SSE endpoints.
 */
async function handleHttpRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  serverInstance: Server
): Promise<void> {
  const requestUrl = request.url || "/";

  const activeMCPToken = getEffectiveMCPToken();
  if (activeMCPToken) {
    const authHeader = request.headers["authorization"] || "";
    const expectedHeader = `Bearer ${activeMCPToken}`;
    if (authHeader !== expectedHeader) {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Unauthorized MCP access" }));
      return;
    }
  }

  if (request.method === "GET" && requestUrl.startsWith("/sse")) {
    const sseTransport = new SSEServerTransport("/message", response);
    activeSseTransportsMap.set(sseTransport.sessionId, sseTransport);
    await serverInstance.connect(sseTransport);
    return;
  }

  if (request.method === "POST" && requestUrl.startsWith("/message")) {
    const urlObject = new URL(requestUrl, `http://${request.headers.host}`);
    const sessionId = urlObject.searchParams.get("sessionId");
    if (sessionId && activeSseTransportsMap.has(sessionId)) {
      const transportInstance = activeSseTransportsMap.get(sessionId)!;
      await transportInstance.handlePostMessage(request, response);
      return;
    }
  }

  if (request.method === "POST" && requestUrl === "/api/mcp/tool") {
    let requestBodyRaw = "";
    request.on("data", (chunk) => {
      requestBodyRaw += chunk;
    });

    request.on("end", async () => {
      try {
        const parsedBody = JSON.parse(requestBodyRaw);
        const requestedToolName = parsedBody.tool;
        const requestedToolArguments = parsedBody.arguments || {};

        const resultData = await executeMCPTool(requestedToolName, requestedToolArguments);

        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            success: true,
            result: resultData,
          })
        );
      } catch (postError: any) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ success: false, error: postError.message }));
      }
    });
    return;
  }

  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: "Endpoint not found" }));
}

/**
 * Main application entrypoint starting Stdio and HTTP MCP transports.
 */
async function startServer(): Promise<void> {
  const mcpServerInstance = createMCPServer();

  if (process.argv.includes("--stdio")) {
    const stdioTransport = new StdioServerTransport();
    await mcpServerInstance.connect(stdioTransport);
    return;
  }

  const httpServerInstance = http.createServer((request, response) => {
    handleHttpRequest(request, response, mcpServerInstance);
  });

  httpServerInstance.listen(MCP_PORT, () => {
    console.log(`Open-Overleaf MCP Server running on HTTP port ${MCP_PORT}`);
  });
}

startServer().catch((fatalError) => {
  console.error("Fatal MCP Server error:", fatalError);
  process.exit(1);
});
