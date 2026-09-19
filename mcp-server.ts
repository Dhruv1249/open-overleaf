import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import * as crypto from "crypto";

const execFileAsync = promisify(execFile);
const MCP_PORT = parseInt(process.env.MCP_PORT || "3202", 10);
const DEPLOY_KEY_PATH = process.env.DEPLOY_KEY_PATH || "/run/secrets/deploy_key";
const GIT_AUTHOR_NAME = process.env.GIT_AUTHOR_NAME || "open-overleaf-mcp";
const GIT_AUTHOR_EMAIL = process.env.GIT_AUTHOR_EMAIL || "mcp@open-overleaf.local";
const DEFAULT_BRANCH = process.env.DEFAULT_BRANCH || "main";
const GITHUB_REPO_OWNER = process.env.GITHUB_SINGLE_REPO_OWNER || "";
const GITHUB_REPO_NAME = process.env.GITHUB_SINGLE_REPO_NAME || "";

/*
 * Serializes all git write operations so concurrent MCP calls never corrupt the working tree.
 */
let gitOperationQueue: Promise<void> = Promise.resolve();

function getProjectsDir(): string {
  return process.env.PROJECTS_DIR || path.join(process.cwd(), "projects");
}

/*
 * Builds the GIT_SSH_COMMAND environment string that points git at the repo-scoped deploy key.
 * The deploy key grants push/pull access only to the single overleaf-projects repository.
 */
function buildSshCommandEnv(): Record<string, string> {
  return {
    GIT_SSH_COMMAND: `ssh -i ${DEPLOY_KEY_PATH} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`,
    GIT_AUTHOR_NAME,
    GIT_AUTHOR_EMAIL,
    GIT_COMMITTER_NAME: GIT_AUTHOR_NAME,
    GIT_COMMITTER_EMAIL: GIT_AUTHOR_EMAIL,
  };
}

/*
 * Returns true when the projects directory is a git working tree.
 */
function isGitRepo(repoDir: string): boolean {
  return fs.existsSync(path.join(repoDir, ".git"));
}

/*
 * Ensures the projects directory is a fully initialized git clone of the GitHub repo.
 * Called once at startup. Subsequent syncs happen per-mutation via pullAndPush.
 */
async function ensureRepoCloned(): Promise<void> {
  const projectsDir = getProjectsDir();
  if (isGitRepo(projectsDir)) {
    return;
  }
  if (!GITHUB_REPO_OWNER || !GITHUB_REPO_NAME) {
    throw new Error("GITHUB_SINGLE_REPO_OWNER and GITHUB_SINGLE_REPO_NAME must be set");
  }
  fs.mkdirSync(projectsDir, { recursive: true });
  const sshRemote = `git@github.com:${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}.git`;
  await execFileAsync(
    "git",
    ["clone", "--branch", DEFAULT_BRANCH, sshRemote, "."],
    { cwd: projectsDir, env: { ...process.env, ...buildSshCommandEnv() } }
  );
  console.log(`[MCP Git] Cloned ${sshRemote} into ${projectsDir}`);
}

/*
 * Stages all changes, commits with the given message, pulls remote changes via rebase,
 * then pushes. If the pull or push fails, the error propagates — callers treat it as fatal.
 * All git mutations are serialized through gitOperationQueue to prevent concurrent conflicts.
 */
async function commitPullAndPush(commitMessage: string): Promise<void> {
  gitOperationQueue = gitOperationQueue.then(async () => {
    const repoDir = getProjectsDir();
    const sshEnv = { ...process.env, ...buildSshCommandEnv() };
    await execFileAsync("git", ["add", "-A"], { cwd: repoDir });
    const { stdout: statusOutput } = await execFileAsync("git", ["status", "--porcelain"], { cwd: repoDir });
    if (!statusOutput.trim()) {
      return;
    }
    await execFileAsync(
      "git",
      ["commit", "-m", commitMessage, "--author", `${GIT_AUTHOR_NAME} <${GIT_AUTHOR_EMAIL}>`],
      { cwd: repoDir, env: sshEnv }
    );
    await execFileAsync(
      "git",
      ["pull", "--rebase", "origin", DEFAULT_BRANCH],
      { cwd: repoDir, env: sshEnv }
    );
    await execFileAsync(
      "git",
      ["push", "origin", DEFAULT_BRANCH],
      { cwd: repoDir, env: sshEnv }
    );
    console.log(`[MCP Git] Committed and pushed: ${commitMessage}`);
  });
  return gitOperationQueue;
}

/*
 * Enforces that the resolved path stays within the project subdirectory, preventing traversal attacks.
 */
function resolveSafePath(projectName: string, filePath: string): string {
  const resolvedProjectsRoot = path.resolve(getProjectsDir());
  const resolvedProjectFolder = path.resolve(resolvedProjectsRoot, projectName);

  if (!resolvedProjectFolder.startsWith(resolvedProjectsRoot)) {
    throw new Error(`Security Violation: Access denied for project directory ${projectName}`);
  }

  const resolvedTargetFile = path.resolve(resolvedProjectFolder, filePath);
  if (!resolvedTargetFile.startsWith(resolvedProjectFolder)) {
    throw new Error(`Security Violation: Access denied for path ${filePath}`);
  }

  return resolvedTargetFile;
}



async function getPDFPageCount(pdfFilePath: string): Promise<number> {
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

interface LocalFileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  type: string;
  sizeBytes: number;
}

/*
 * Recursively lists files and directories under a given local directory.
 * Excludes hidden entries (names starting with ".") to avoid exposing .git internals.
 */
function listLocalFilesRecursively(absoluteDir: string, relativeBase: string): LocalFileEntry[] {
  const entries: LocalFileEntry[] = [];
  if (!fs.existsSync(absoluteDir)) {
    return entries;
  }
  for (const dirent of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (dirent.name.startsWith(".")) {
      continue;
    }
    const relativePath = relativeBase ? `${relativeBase}/${dirent.name}` : dirent.name;
    if (dirent.isDirectory()) {
      entries.push({ name: dirent.name, path: relativePath, isDirectory: true, type: "dir", sizeBytes: 0 });
      entries.push(...listLocalFilesRecursively(path.join(absoluteDir, dirent.name), relativePath));
    } else {
      const sizeBytes = fs.statSync(path.join(absoluteDir, dirent.name)).size;
      entries.push({ name: dirent.name, path: relativePath, isDirectory: false, type: "file", sizeBytes });
    }
  }
  return entries;
}

const INTERNAL_APP_URL = process.env.INTERNAL_APP_URL || `http://127.0.0.1:${process.env.PORT || "8080"}`;

/*
 * Core execution engine carrying out individual MCP tool logic against the local git working tree.
 */
export async function executeMCPTool(name: string, toolArguments: Record<string, any>): Promise<any> {
  console.log(`[MCP Server] Call received for tool: "${name}" | Args:`, JSON.stringify(toolArguments));
  try {
    const result = await executeMCPToolInner(name, toolArguments);
    console.log(`[MCP Server] Tool "${name}" execution succeeded`);
    return result;
  } catch (error: any) {
    console.error(`[MCP Server] Tool "${name}" execution failed | Error:`, error.message || error);
    throw error;
  }
}

async function executeMCPToolInner(name: string, toolArguments: Record<string, any>): Promise<any> {
  const projectsDir = getProjectsDir();

  if (name === "list_projects") {
    if (!fs.existsSync(projectsDir)) {
      fs.mkdirSync(projectsDir, { recursive: true });
    }
    const projects = fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name);
    return { projects };
  }

  if (name === "list_files") {
    const projectName = String(toolArguments?.projectName);
    const subDirectory = String(toolArguments?.subDir || "");
    const absoluteProjectDir = resolveSafePath(projectName, subDirectory || ".");
    const entries = listLocalFilesRecursively(absoluteProjectDir, subDirectory);
    return { files: entries };
  }

  if (name === "read_project_file") {
    const projectName = String(toolArguments?.projectName);
    const filePath = String(toolArguments?.filePath);
    const absoluteFilePath = resolveSafePath(projectName, filePath);
    if (!fs.existsSync(absoluteFilePath)) {
      throw new Error(`File not found: ${filePath} in project ${projectName}`);
    }
    const content = fs.readFileSync(absoluteFilePath, "utf-8");
    return { content };
  }

  if (name === "read_file_lines") {
    const projectName = String(toolArguments?.projectName);
    const filePath = String(toolArguments?.filePath);
    const startLineNumber = parseInt(toolArguments?.startLine || "1", 10);
    const endLineNumber = parseInt(toolArguments?.endLine || "100", 10);
    const absoluteFilePath = resolveSafePath(projectName, filePath);
    if (!fs.existsSync(absoluteFilePath)) {
      throw new Error(`File not found: ${filePath} in project ${projectName}`);
    }
    const allLines = fs.readFileSync(absoluteFilePath, "utf-8").split("\n");
    const slicedLines = allLines.slice(
      Math.max(0, startLineNumber - 1),
      Math.min(allLines.length, endLineNumber)
    );
    return {
      filePath,
      startLine: startLineNumber,
      endLine: endLineNumber,
      totalLines: allLines.length,
      linesContent: slicedLines.join("\n"),
    };
  }

  if (name === "delete_file") {
    const projectName = String(toolArguments?.projectName);
    const filePath = String(toolArguments?.filePath);
    const absoluteFilePath = resolveSafePath(projectName, filePath);
    if (fs.existsSync(absoluteFilePath)) {
      const stats = fs.statSync(absoluteFilePath);
      if (stats.isDirectory()) {
        fs.rmSync(absoluteFilePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(absoluteFilePath);
      }
    }
    await commitPullAndPush(`mcp: delete ${projectName}/${filePath}`);
    return { message: `Successfully deleted ${filePath} in project ${projectName}` };
  }

  if (name === "create_file") {
    const projectName = String(toolArguments?.projectName);
    const filePath = String(toolArguments?.filePath);
    const fileContent = String(toolArguments?.content ?? "");
    const absoluteFilePath = resolveSafePath(projectName, filePath);
    if (fs.existsSync(absoluteFilePath)) {
      throw new Error(`File already exists: ${filePath} in project ${projectName}`);
    }
    fs.mkdirSync(path.dirname(absoluteFilePath), { recursive: true });
    fs.writeFileSync(absoluteFilePath, fileContent, "utf-8");
    await commitPullAndPush(`mcp: create ${projectName}/${filePath}`);
    return { message: `Successfully created file ${filePath} in project ${projectName}` };
  }

  if (name === "write_project_file") {
    const projectName = String(toolArguments?.projectName);
    const filePath = String(toolArguments?.filePath);
    const content = String(toolArguments?.content ?? "");
    const absoluteFilePath = resolveSafePath(projectName, filePath);
    fs.mkdirSync(path.dirname(absoluteFilePath), { recursive: true });
    fs.writeFileSync(absoluteFilePath, content, "utf-8");

    const compileWorkPath = path.join("/tmp/oo-compile", projectName, filePath);
    try {
      fs.mkdirSync(path.dirname(compileWorkPath), { recursive: true });
      fs.writeFileSync(compileWorkPath, content, "utf-8");
    } catch (workDirErr: any) {
      console.warn(`[MCP Server] Note: could not mirror to compile workdir:`, workDirErr.message);
    }

    await commitPullAndPush(`mcp: write ${projectName}/${filePath}`);
    return { success: true, message: `Successfully wrote ${filePath} in project ${projectName}` };
  }

  if (name === "apply_patch") {
    const projectName = String(toolArguments?.projectName);
    const filePath = String(toolArguments?.filePath);
    const patches = toolArguments?.patches;

    if (!Array.isArray(patches) || patches.length === 0) {
      throw new Error("patches array must be provided and non-empty");
    }

    const absoluteFilePath = resolveSafePath(projectName, filePath);
    if (!fs.existsSync(absoluteFilePath)) {
      throw new Error(`File not found: ${filePath} in project ${projectName}`);
    }

    const originalText = fs.readFileSync(absoluteFilePath, "utf-8");
    const lines = originalText.split("\n");
    const sortedPatches = [...patches].sort((a, b) => b.startLine - a.startLine);

    for (const patch of sortedPatches) {
      const { startLine, endLine, originalContent, newContent } = patch;
      let actualStartLine = startLine;
      let actualEndLine = endLine;
      let matched = false;

      if (startLine >= 1 && endLine <= lines.length && startLine <= endLine) {
        const actualBlock = lines.slice(startLine - 1, endLine).join("\n");
        if (actualBlock.trim() === originalContent.trim()) {
          matched = true;
        }
      }

      if (!matched) {
        for (let offset = -5; offset <= 5; offset++) {
          if (offset === 0) continue;
          const shiftedStart = startLine + offset;
          const shiftedEnd = endLine + offset;
          if (shiftedStart >= 1 && shiftedEnd <= lines.length && shiftedStart <= shiftedEnd) {
            const actualBlock = lines.slice(shiftedStart - 1, shiftedEnd).join("\n");
            if (actualBlock.trim() === originalContent.trim()) {
              actualStartLine = shiftedStart;
              actualEndLine = shiftedEnd;
              matched = true;
              break;
            }
          }
        }
      }

      if (!matched) {
        const normalizedOriginal = originalContent.trim().replace(/\r\n/g, "\n");
        const joinedFile = lines.join("\n");
        const matchIndex = joinedFile.indexOf(normalizedOriginal);
        if (matchIndex !== -1) {
          const replacedFile =
            joinedFile.substring(0, matchIndex) +
            newContent +
            joinedFile.substring(matchIndex + normalizedOriginal.length);
          lines.length = 0;
          lines.push(...replacedFile.split("\n"));
          continue;
        }
      }

      if (!matched) {
        const actualBlock = lines.slice(startLine - 1, Math.min(endLine, lines.length)).join("\n");
        throw new Error(
          `Validation failed for line range [${startLine}, ${endLine}]. ` +
          `Expected:\n"${originalContent}"\nBut found:\n"${actualBlock}"`
        );
      }

      const replacementLines = newContent.split("\n");
      lines.splice(actualStartLine - 1, actualEndLine - actualStartLine + 1, ...replacementLines);
    }

    const updatedContent = lines.join("\n");
    fs.writeFileSync(absoluteFilePath, updatedContent, "utf-8");

    const compileWorkPath = path.join("/tmp/oo-compile", projectName, filePath);
    try {
      fs.mkdirSync(path.dirname(compileWorkPath), { recursive: true });
      fs.writeFileSync(compileWorkPath, updatedContent, "utf-8");
    } catch {
    }

    await commitPullAndPush(`mcp: patch ${projectName}/${filePath} (${patches.length} chunk(s))`);
    return {
      success: true,
      message: `Successfully applied ${patches.length} patch(es) to ${filePath}`,
      originalContent: originalText,
      updatedContent,
    };
  }

  if (name === "rename_file") {
    const projectName = String(toolArguments?.projectName);
    const fromPath = String(toolArguments?.fromPath);
    const toPath = String(toolArguments?.toPath);
    const absoluteSourcePath = resolveSafePath(projectName, fromPath);
    const absoluteDestinationPath = resolveSafePath(projectName, toPath);
    if (!fs.existsSync(absoluteSourcePath)) {
      throw new Error(`Source not found: ${fromPath} in project ${projectName}`);
    }
    fs.mkdirSync(path.dirname(absoluteDestinationPath), { recursive: true });
    fs.renameSync(absoluteSourcePath, absoluteDestinationPath);

    const compileSourcePath = path.join("/tmp/oo-compile", projectName, fromPath);
    const compileDestinationPath = path.join("/tmp/oo-compile", projectName, toPath);
    try {
      if (fs.existsSync(compileSourcePath)) {
        fs.mkdirSync(path.dirname(compileDestinationPath), { recursive: true });
        fs.renameSync(compileSourcePath, compileDestinationPath);
      }
    } catch {
    }

    await commitPullAndPush(`mcp: rename ${projectName}/${fromPath} → ${toPath}`);
    return { message: `Renamed ${fromPath} → ${toPath} in project ${projectName}` };
  }

  if (name === "get_project_settings") {
    const projectName = String(toolArguments?.projectName);
    const settingsAbsolutePath = resolveSafePath(projectName, ".overleaf.json");
    if (!fs.existsSync(settingsAbsolutePath)) {
      return { settings: null };
    }
    try {
      const rawSettings = fs.readFileSync(settingsAbsolutePath, "utf-8");
      return { settings: JSON.parse(rawSettings) };
    } catch {
      return { settings: null };
    }
  }

  if (name === "update_project_settings") {
    const projectName = String(toolArguments?.projectName);
    const settings = toolArguments?.settings;
    if (!settings || typeof settings !== "object") {
      throw new Error("settings object required");
    }
    const settingsAbsolutePath = resolveSafePath(projectName, ".overleaf.json");
    fs.mkdirSync(path.dirname(settingsAbsolutePath), { recursive: true });
    fs.writeFileSync(settingsAbsolutePath, JSON.stringify(settings, null, 2), "utf-8");
    await commitPullAndPush(`mcp: update settings for ${projectName}`);
    return { message: `Settings updated for project ${projectName}` };
  }

  if (name === "get_file_history") {
    const projectName = String(toolArguments?.projectName);
    const filePath = String(toolArguments?.filePath);
    const perPage = Math.min(parseInt(toolArguments?.perPage || "30", 10), 100);
    const absoluteFilePath = resolveSafePath(projectName, filePath);
    const relativePathInRepo = path.relative(getProjectsDir(), absoluteFilePath);
    try {
      const { stdout } = await execFileAsync(
        "git",
        [
          "log",
          `--max-count=${perPage}`,
          "--format=%H%n%an%n%ae%n%ai%n%s%n---",
          "--",
          relativePathInRepo,
        ],
        { cwd: getProjectsDir() }
      );
      const commits = stdout
        .split("---\n")
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => {
          const [sha, authorName, authorEmail, date, ...messageParts] = block.split("\n");
          return { sha, authorName, authorEmail, date, message: messageParts.join("\n") };
        });
      return { commits };
    } catch {
      return { commits: [], message: "No commit history found for this file" };
    }
  }

  if (name === "get_file_at_revision") {
    const projectName = String(toolArguments?.projectName);
    const filePath = String(toolArguments?.filePath);
    const sha = String(toolArguments?.sha || toolArguments?.commitSha || "");
    if (!sha) {
      throw new Error("sha (commit SHA) is required");
    }
    const absoluteFilePath = resolveSafePath(projectName, filePath);
    const relativePathInRepo = path.relative(getProjectsDir(), absoluteFilePath);
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["show", `${sha}:${relativePathInRepo}`],
        { cwd: getProjectsDir() }
      );
      return { content: stdout, sha };
    } catch (revisionError: any) {
      throw new Error(`Could not retrieve ${filePath} at revision ${sha}: ${revisionError.message}`);
    }
  }

  if (name === "sync_to_drive") {
    const projectName = String(toolArguments?.projectName);
    const mainFile = String(toolArguments?.mainFile || "main.tex");
    const response = await fetch(`${INTERNAL_APP_URL}/api/drive/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: projectName, mainFile }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.error) {
      throw new Error(`Drive sync failed: ${data?.error || response.status}`);
    }
    return {
      driveUrl: data.webViewLink,
      fileId: data.fileId,
      drivePath: data.drivePath,
    };
  }

  if (name === "compile_project") {
    const projectName = String(toolArguments?.projectName);
    const engineName = String(toolArguments?.engine || "xelatex");
    const entryFilename = String(toolArguments?.entryFile || "main.tex");

    let result: any = null;
    try {
      const response = await fetch(`${INTERNAL_APP_URL}/api/projects/${encodeURIComponent(projectName)}/compile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mainFile: entryFilename, engine: engineName }),
      });
      result = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 422) {
        throw new Error(`Compile request failed (HTTP ${response.status}): ${result?.error || JSON.stringify(result)}`);
      }
    } catch (fetchErr: any) {
      if (!result) throw fetchErr;
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

    return {
      status: result?.ok ? "compiled" : "failed",
      engine: engineName,
      pdfFile: result?.pdfFile ?? "",
      pdfPath: result?.pdfFile ?? "",
      pageCount: calculatedPageCount,
      errorCount: result?.errors ?? (result?.ok ? 0 : 1),
      warningCount: result?.warnings ?? 0,
      outputLog: result?.log ?? "",
      log: result?.log ?? "",
      errors: typeof result?.error === "string" ? result.error : (result?.ok ? "" : "Compilation failed"),
    };
  }

  if (name === "get_project_pdf") {
    const projectName = String(toolArguments?.projectName);
    const pdfFilename = String(toolArguments?.pdfName || "main.pdf");
    const texName = pdfFilename.replace(/\.pdf$/i, ".tex");
    let compileResult: any = null;

    let pdfResponse = await fetch(
      `${INTERNAL_APP_URL}/api/projects/${encodeURIComponent(projectName)}/pdf?mainFile=${encodeURIComponent(texName)}`
    );

    if (!pdfResponse.ok) {
      compileResult = await fetch(
        `${INTERNAL_APP_URL}/api/projects/${encodeURIComponent(projectName)}/compile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mainFile: texName }),
        }
      ).then((r) => r.json().catch(() => ({})));

      pdfResponse = await fetch(
        `${INTERNAL_APP_URL}/api/projects/${encodeURIComponent(projectName)}/pdf?mainFile=${encodeURIComponent(texName)}`
      );
    }

    if (!pdfResponse.ok) {
      throw new Error(`PDF compilation failed for project ${projectName}: ${compileResult?.log || "PDF not found"}`);
    }

    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
    const base64DataString = pdfBuffer.toString("base64");
    const tempPdfPath = path.join("/tmp/oo-compile", projectName, `temp-${Date.now()}-${path.basename(pdfFilename)}`);
    fs.mkdirSync(path.dirname(tempPdfPath), { recursive: true });
    fs.writeFileSync(tempPdfPath, pdfBuffer);
    const totalPages = await getPDFPageCount(tempPdfPath);
    try { fs.unlinkSync(tempPdfPath); } catch { }

    return {
      fileName: pdfFilename,
      mimeType: "application/pdf",
      pageCount: totalPages,
      base64Data: base64DataString,
      sizeBytes: pdfBuffer.length,
      compilationStatus: compileResult ? (compileResult.ok ? "compiled" : "failed") : "cached",
      errorCount: compileResult?.errors ?? 0,
      warningCount: compileResult?.warnings ?? 0,
      log: compileResult?.log ?? "",
    };
  }

  if (name === "get_project_preview_image") {
    const projectName = String(toolArguments?.projectName);
    const pdfFilename = String(toolArguments?.pdfName || "main.pdf");
    const targetPageNumber = parseInt(toolArguments?.pageNumber || "1", 10);
    const resolutionDPI = parseInt(toolArguments?.dpi || "150", 10);
    const texName = pdfFilename.replace(/\.pdf$/i, ".tex");
    let compileResult: any = null;

    const pdfFullPath = path.join("/tmp/oo-compile", projectName, pdfFilename);
    if (!fs.existsSync(pdfFullPath)) {
      compileResult = await fetch(
        `${INTERNAL_APP_URL}/api/projects/${encodeURIComponent(projectName)}/compile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mainFile: texName }),
        }
      ).then((r) => r.json().catch(() => ({})));
    }

    if (!fs.existsSync(pdfFullPath)) {
      throw new Error(`Failed to compile or find PDF ${pdfFilename} in project ${projectName}: ${compileResult?.log || ""}`);
    }

    const temporaryOutputPrefix = path.join("/tmp/oo-compile", projectName, `preview_p${targetPageNumber}`);
    await execFileAsync("pdftoppm", [
      "-png", "-r", String(resolutionDPI),
      "-f", String(targetPageNumber),
      "-l", String(targetPageNumber),
      pdfFullPath, temporaryOutputPrefix,
    ]);

    const expectedPngPath = `${temporaryOutputPrefix}-${targetPageNumber}.png`;
    const fallbackPngPath = `${temporaryOutputPrefix}-01.png`;
    const finalPngPath = fs.existsSync(expectedPngPath) ? expectedPngPath : fallbackPngPath;

    if (!fs.existsSync(finalPngPath)) {
      throw new Error(`Failed generating PNG preview image for page ${targetPageNumber}`);
    }

    const imageBuffer = fs.readFileSync(finalPngPath);
    const imageBase64String = imageBuffer.toString("base64");
    try { fs.unlinkSync(finalPngPath); } catch { }

    return {
      fileName: `${path.basename(pdfFilename, ".pdf")}_p${targetPageNumber}.png`,
      mimeType: "image/png",
      pageNumber: targetPageNumber,
      base64Data: imageBase64String,
      sizeBytes: imageBuffer.length,
      compilationStatus: compileResult ? (compileResult.ok ? "compiled" : "failed") : "cached",
      errorCount: compileResult?.errors ?? 0,
      warningCount: compileResult?.warnings ?? 0,
      log: compileResult?.log ?? "",
    };
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

    const projectDir = resolveSafePath(projectName, ".");
    if (!fs.existsSync(projectDir)) {
      throw new Error(`Project ${projectName} not found`);
    }

    const grepArgs: string[] = ["-rn"];
    if (!caseSensitive) {
      grepArgs.push("-i");
    }
    if (filePattern) {
      grepArgs.push(`--include=${filePattern}`);
    }
    grepArgs.push("--exclude-dir=.git", query, ".");

    let grepOutput = "";
    try {
      const result = await execFileAsync("grep", grepArgs, { cwd: projectDir });
      grepOutput = result.stdout;
    } catch (grepError: any) {
      grepOutput = grepError.stdout || "";
    }

    const matches = grepOutput
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const colonIndex = line.indexOf(":");
        const afterFirst = line.indexOf(":", colonIndex + 1);
        if (colonIndex === -1 || afterFirst === -1) return null;
        let matchedFile = line.slice(0, colonIndex);
        if (matchedFile.startsWith("./")) {
          matchedFile = matchedFile.slice(2);
        }
        return {
          file: matchedFile,
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
    const absoluteFilePath = resolveSafePath(projectName, filePath);

    if (!fs.existsSync(absoluteFilePath)) {
      throw new Error(`File not found: ${filePath} in project ${projectName}`);
    }

    let chktexOutput = "";
    try {
      const result = await execFileAsync("chktex", ["-q", absoluteFilePath]);
      chktexOutput = result.stdout + result.stderr;
    } catch (chktexError: any) {
      chktexOutput = (chktexError.stdout || "") + (chktexError.stderr || "");
      if (
        chktexError.code === "ENOENT" ||
        chktexOutput.includes("not found") ||
        chktexOutput.includes("command not found")
      ) {
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

  throw new Error(`Unknown MCP tool requested: ${name}`);
}

/*
 * Initializes and configures the Model Context Protocol Server with LaTeX management tools.
 * All tools operate on the local git working tree — no GitHub API calls or tokens required.
 */
export function createMCPServer(): Server {
  const serverInstance = new Server(
    { name: "open-overleaf-mcp-server", version: "2.0.0" },
    { capabilities: { tools: {} } }
  );

  serverInstance.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "list_projects",
          description: "Lists all LaTeX projects in the local git working tree.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "list_files",
          description: "Lists all files and directories inside a LaTeX project from the local git working tree.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              subDir: { type: "string", description: "Optional sub-directory path relative to project root", default: "" },
            },
            required: ["projectName"],
          },
        },
        {
          name: "read_project_file",
          description: "Reads a file from a LaTeX project in the local git working tree.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              filePath: { type: "string", description: "Relative file path inside project" },
            },
            required: ["projectName", "filePath"],
          },
        },
        {
          name: "read_file_lines",
          description: "Reads a specific line range from a project file.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              filePath: { type: "string", description: "Relative file path inside project" },
              startLine: { type: "integer", description: "1-indexed starting line", default: 1 },
              endLine: { type: "integer", description: "1-indexed ending line", default: 100 },
            },
            required: ["projectName", "filePath"],
          },
        },
        {
          name: "delete_file",
          description: "Deletes a file or directory from a project, commits, and pushes.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              filePath: { type: "string", description: "Relative path to file or directory" },
            },
            required: ["projectName", "filePath"],
          },
        },
        {
          name: "create_file",
          description: "Creates a new file in a project, commits, and pushes.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the project" },
              filePath: { type: "string", description: "Relative file path to create" },
              content: { type: "string", description: "Initial file content", default: "" },
            },
            required: ["projectName", "filePath"],
          },
        },
        {
          name: "write_project_file",
          description: "Writes full file content to a project, commits, and pushes.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              filePath: { type: "string", description: "Relative file path inside project" },
              content: { type: "string", description: "The full text content to write" },
            },
            required: ["projectName", "filePath", "content"],
          },
        },
        {
          name: "apply_patch",
          description: "Applies targeted chunk-based replacements to a file, commits, and pushes. Prefer this over write_project_file for partial edits.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the project" },
              filePath: { type: "string", description: "Relative file path inside project" },
              patches: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    startLine: { type: "integer", description: "1-indexed starting line of the block to replace" },
                    endLine: { type: "integer", description: "1-indexed ending line of the block to replace" },
                    originalContent: { type: "string", description: "Exact content expected at those lines" },
                    newContent: { type: "string", description: "Replacement content" },
                  },
                  required: ["startLine", "endLine", "originalContent", "newContent"],
                },
                description: "List of patch chunks to apply",
              },
            },
            required: ["projectName", "filePath", "patches"],
          },
        },
        {
          name: "rename_file",
          description: "Renames or moves a file within a project, commits, and pushes.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the project" },
              fromPath: { type: "string", description: "Current relative path" },
              toPath: { type: "string", description: "New relative path" },
            },
            required: ["projectName", "fromPath", "toPath"],
          },
        },
        {
          name: "sync_to_drive",
          description: "Syncs the compiled PDF to Google Drive and returns a stable webViewLink.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              mainFile: { type: "string", description: "Main .tex filename", default: "main.tex" },
            },
            required: ["projectName"],
          },
        },
        {
          name: "compile_project",
          description: "Triggers LaTeX compilation for a project.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              engine: { type: "string", description: "Compilation engine: xelatex, pdflatex, lualatex", default: "xelatex" },
              entryFile: { type: "string", description: "Target .tex file to compile", default: "main.tex" },
            },
            required: ["projectName"],
          },
        },
        {
          name: "get_project_pdf",
          description: "Retrieves the compiled PDF as base64 encoded data.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              pdfName: { type: "string", description: "PDF filename", default: "main.pdf" },
            },
            required: ["projectName"],
          },
        },
        {
          name: "get_project_preview_image",
          description: "Renders a PDF page as a PNG preview image (base64 string).",
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
          name: "get_project_settings",
          description: "Reads the project settings manifest (.overleaf.json) from the local git working tree.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the project" },
            },
            required: ["projectName"],
          },
        },
        {
          name: "update_project_settings",
          description: "Updates the project settings manifest (.overleaf.json), commits, and pushes.",
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
                description: "Settings keys to update",
              },
            },
            required: ["projectName", "settings"],
          },
        },
        {
          name: "get_file_history",
          description: "Returns git commit history for a specific file using the local git log.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the project" },
              filePath: { type: "string", description: "Relative file path inside project" },
              perPage: { type: "integer", description: "Maximum number of commits to return", default: 30 },
            },
            required: ["projectName", "filePath"],
          },
        },
        {
          name: "get_file_at_revision",
          description: "Returns the content of a file at a specific commit SHA using git show.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the project" },
              filePath: { type: "string", description: "Relative file path inside project" },
              sha: { type: "string", description: "Commit SHA" },
            },
            required: ["projectName", "filePath", "sha"],
          },
        },
        {
          name: "get_compilation_log",
          description: "Reads a LaTeX compilation log file from the compile output directory.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the project" },
              logFile: { type: "string", description: "Log filename", default: "main.log" },
              startLine: { type: "integer", description: "1-indexed starting line", default: 1 },
              endLine: { type: "integer", description: "1-indexed ending line" },
            },
            required: ["projectName"],
          },
        },
        {
          name: "search_in_project",
          description: "Full-text search across all files in a project using grep on the local working tree.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the project" },
              query: { type: "string", description: "String to search for" },
              filePattern: { type: "string", description: "Glob pattern to filter files, e.g. *.tex" },
              caseSensitive: { type: "boolean", description: "Whether search is case-sensitive", default: true },
            },
            required: ["projectName", "query"],
          },
        },
        {
          name: "validate_tex",
          description: "Runs chktex to lint a LaTeX file and return syntax diagnostics.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the project" },
              filePath: { type: "string", description: "Relative file path inside project" },
            },
            required: ["projectName", "filePath"],
          },
        },
      ],
    };
  });

  serverInstance.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: toolArguments } = request.params;
    try {
      const resultData = await executeMCPTool(name, toolArguments || {});
      return { content: [{ type: "text", text: JSON.stringify(resultData) }] };
    } catch (handlerError: any) {
      return {
        content: [{ type: "text", text: `Error executing tool ${name}: ${handlerError.message}` }],
        isError: true,
      };
    }
  });

  return serverInstance;
}

function getEffectiveMCPToken(): string {
  if (process.env.OVERLEAF_MCP_TOKEN) {
    return process.env.OVERLEAF_MCP_TOKEN;
  }
  const secretString = process.env.OVERLEAF_MCP_SECRET || process.env.SESSION_SECRET;
  if (!secretString) {
    throw new Error("Neither OVERLEAF_MCP_TOKEN nor SESSION_SECRET is configured");
  }
  const ghClientSecret = process.env.GITHUB_CLIENT_SECRET || "";
  const ghHash = ghClientSecret
    ? crypto.createHash("sha256").update(ghClientSecret).digest("hex")
    : "";
  const repoName = process.env.GITHUB_SINGLE_REPO_NAME || "overleaf-projects";
  return crypto.createHash("sha256").update(`${secretString}:${ghHash}:${repoName}`).digest("hex");
}

const activeSseTransportsMap = new Map<string, SSEServerTransport>();
const activeStreamableTransportsMap = new Map<string, StreamableHTTPServerTransport>();

/*
 * Handles incoming HTTP requests for REST tool execution, SSE, and Streamable HTTP transports.
 */
export async function handleHttpRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse
): Promise<void> {
  const requestUrl = request.url || "/";
  const parsedUrl = new URL(requestUrl, `http://${request.headers.host || "localhost"}`);
  const normalizedPathname = parsedUrl.pathname;
  console.log(`[MCP Server HTTP] Request: ${request.method} ${normalizedPathname}`);

  try {
    const authorizationHeader = (request.headers["authorization"] || "").trim();
    if (!authorizationHeader.startsWith("Bearer ")) {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Unauthorized: Missing Bearer token" }));
      return;
    }
    const incomingToken = authorizationHeader.slice(7).trim();
    let isAuthorized = false;

    try {
      isAuthorized = incomingToken === getEffectiveMCPToken();
    } catch { }

    if (!isAuthorized && process.env.OVERLEAF_MCP_TOKEN) {
      isAuthorized = incomingToken === process.env.OVERLEAF_MCP_TOKEN.trim();
    }
    if (!isAuthorized && process.env.SESSION_SECRET) {
      isAuthorized = incomingToken === process.env.SESSION_SECRET.trim();
    }
    if (!isAuthorized && process.env.OVERLEAF_MCP_SECRET) {
      isAuthorized = incomingToken === crypto.createHash("sha256").update(process.env.OVERLEAF_MCP_SECRET.trim()).digest("hex");
    }
    if (!isAuthorized && process.env.SESSION_SECRET) {
      isAuthorized = incomingToken === crypto.createHash("sha256").update(process.env.SESSION_SECRET.trim()).digest("hex");
    }

    if (!isAuthorized) {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Unauthorized MCP access: invalid token" }));
      return;
    }
  } catch (authError: any) {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: authError.message || "MCP authentication error" }));
    return;
  }

  if (request.method === "POST" && normalizedPathname === "/api/mcp/tool") {
    let requestBodyRaw = "";
    request.on("data", (chunk) => { requestBodyRaw += chunk; });
    request.on("end", async () => {
      try {
        const parsedBody = JSON.parse(requestBodyRaw);
        const resultData = await executeMCPTool(parsedBody.tool, parsedBody.arguments || {});
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ success: true, result: resultData }));
      } catch (postError: any) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ success: false, error: postError.message }));
      }
    });
    return;
  }

  if (request.method === "POST" && normalizedPathname.startsWith("/message")) {
    const sessionId = parsedUrl.searchParams.get("sessionId");
    if (sessionId && activeSseTransportsMap.has(sessionId)) {
      await activeSseTransportsMap.get(sessionId)!.handlePostMessage(request, response);
      return;
    }
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Session not found" }));
    return;
  }

  const isMcpEndpoint =
    normalizedPathname === "/sse" ||
    normalizedPathname === "/mcp" ||
    normalizedPathname === "/";

  if (isMcpEndpoint) {
    const incomingSessionId = (request.headers["mcp-session-id"] as string | undefined)?.trim();

    if (incomingSessionId) {
      const existingTransport = activeStreamableTransportsMap.get(incomingSessionId);
      if (!existingTransport) {
        response.writeHead(404, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Session not found" }, id: null }));
        return;
      }
      await existingTransport.handleRequest(request, response);
      return;
    }

    if (request.method === "GET" && (request.headers["accept"] || "").includes("text/event-stream")) {
      const sseTransport = new SSEServerTransport("/message", response);
      activeSseTransportsMap.set(sseTransport.sessionId, sseTransport);
      sseTransport.onclose = () => { activeSseTransportsMap.delete(sseTransport.sessionId); };
      const sessionServerInstance = createMCPServer();
      await sessionServerInstance.connect(sseTransport);
      return;
    }

    if (request.method === "POST") {
      const streamableTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (newSessionId: string) => {
          activeStreamableTransportsMap.set(newSessionId, streamableTransport);
        },
      });
      streamableTransport.onclose = () => {
        if (streamableTransport.sessionId) {
          activeStreamableTransportsMap.delete(streamableTransport.sessionId);
        }
      };
      const sessionServerInstance = createMCPServer();
      await sessionServerInstance.connect(streamableTransport);
      await streamableTransport.handleRequest(request, response);
      return;
    }

    if (request.method === "GET") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "healthy", service: "open-overleaf-mcp" }));
      return;
    }
  }

  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: "Endpoint not found" }));
}

/*
 * Main application entrypoint — ensures the repo is cloned before starting Stdio or HTTP transports.
 */
async function startServer(): Promise<void> {
  await ensureRepoCloned();

  if (process.argv.includes("--stdio")) {
    const stdioServerInstance = createMCPServer();
    const stdioTransport = new StdioServerTransport();
    await stdioServerInstance.connect(stdioTransport);
    return;
  }

  const httpServerInstance = http.createServer((request, response) => {
    handleHttpRequest(request, response);
  });

  httpServerInstance.listen(MCP_PORT, () => {
    console.log(`Open-Overleaf MCP Server running on HTTP port ${MCP_PORT}`);
  });
}

const currentFilePath = fileURLToPath(import.meta.url);
const executionArgument = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isDirectExecution =
  executionArgument === currentFilePath ||
  executionArgument.endsWith("mcp-server.ts") ||
  executionArgument.endsWith("mcp-server.js");

if (isDirectExecution) {
  startServer().catch((fatalError) => {
    console.error("Fatal MCP Server error:", fatalError);
    process.exit(1);
  });
}
