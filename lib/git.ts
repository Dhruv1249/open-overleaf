import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const DEPLOY_KEY_PATH = process.env.DEPLOY_KEY_PATH || "/run/secrets/deploy_key";
const DEFAULT_BRANCH = process.env.DEFAULT_BRANCH || "main";
const GIT_AUTHOR_NAME = process.env.GIT_AUTHOR_NAME || "open-overleaf";
const GIT_AUTHOR_EMAIL = process.env.GIT_AUTHOR_EMAIL || "webui@open-overleaf.local";

/*
 * Resolves the absolute root of the git working tree (the projects directory).
 * All project subdirectories live here as top-level folders.
 */
export function getRepoRoot(): string {
  const candidates = [
    process.env.PROJECTS_DIR,
    path.join(process.cwd(), "projects"),
    "/app/projects",
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[1];
}

/*
 * Resolves a safe absolute path within a project, preventing directory traversal.
 */
export function resolveSafeProjectPath(project: string, relativePath: string): string {
  const repoRoot = path.resolve(getRepoRoot());
  const projectRoot = path.resolve(repoRoot, project);

  if (!projectRoot.startsWith(repoRoot + path.sep) && projectRoot !== repoRoot) {
    throw new Error(`Security Violation: invalid project name ${project}`);
  }

  const targetPath = relativePath
    ? path.resolve(projectRoot, relativePath)
    : projectRoot;

  if (!targetPath.startsWith(projectRoot)) {
    throw new Error(`Security Violation: path traversal detected in ${relativePath}`);
  }

  return targetPath;
}

/*
 * Builds the GIT_SSH_COMMAND and author env vars for all git operations.
 * The deploy key is scoped exclusively to the overleaf-projects repository.
 */
function buildGitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_SSH_COMMAND: `ssh -i ${DEPLOY_KEY_PATH} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`,
    GIT_AUTHOR_NAME,
    GIT_AUTHOR_EMAIL,
    GIT_COMMITTER_NAME: GIT_AUTHOR_NAME,
    GIT_COMMITTER_EMAIL: GIT_AUTHOR_EMAIL,
  };
}

/*
 * Serializes all git write operations to prevent concurrent conflicts on the working tree.
 */
let gitWriteQueue: Promise<void> = Promise.resolve();

/*
 * Stages all changes, commits, pulls with rebase, then pushes.
 * If pull or push fails the error propagates — the caller receives a 500.
 */
export async function commitPullAndPush(commitMessage: string): Promise<void> {
  gitWriteQueue = gitWriteQueue.then(async () => {
    const repoDir = getRepoRoot();
    const env = buildGitEnv();

    await execFileAsync("git", ["add", "-A"], { cwd: repoDir });

    const { stdout: status } = await execFileAsync("git", ["status", "--porcelain"], { cwd: repoDir });
    if (!status.trim()) {
      return;
    }

    await execFileAsync(
      "git",
      ["commit", "-m", commitMessage, "--author", `${GIT_AUTHOR_NAME} <${GIT_AUTHOR_EMAIL}>`],
      { cwd: repoDir, env }
    );

    await execFileAsync("git", ["pull", "--rebase", "origin", DEFAULT_BRANCH], { cwd: repoDir, env });
    await execFileAsync("git", ["push", "origin", DEFAULT_BRANCH], { cwd: repoDir, env });

    console.log(`[Git] Committed and pushed: ${commitMessage}`);
  });
  return gitWriteQueue;
}

/*
 * Lists all top-level project directories in the repo root.
 * Excludes hidden directories (e.g. .git).
 */
export function listProjects(): string[] {
  const repoRoot = getRepoRoot();
  if (!fs.existsSync(repoRoot)) {
    return [];
  }
  return fs.readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name);
}

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
}

/*
 * Recursively lists files and directories under a project path.
 * Hidden entries and compiled artifact extensions are excluded to keep the listing clean.
 */
export function listFilesRecursively(absoluteDir: string, relativeBase: string): FileEntry[] {
  const ARTIFACT_EXTENSIONS = new Set([
    ".aux", ".log", ".out", ".fls", ".fdb_latexmk",
    ".synctex.gz", ".xdv", ".toc", ".nav", ".snm", ".bcf", ".run.xml",
  ]);

  const entries: FileEntry[] = [];
  if (!fs.existsSync(absoluteDir) || !fs.statSync(absoluteDir).isDirectory()) {
    return entries;
  }

  for (const dirent of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (dirent.name.startsWith(".") || dirent.name.startsWith("temp-")) {
      continue;
    }
    const ext = path.extname(dirent.name).toLowerCase();
    if (!dirent.isDirectory() && ARTIFACT_EXTENSIONS.has(ext)) {
      continue;
    }
    const relativePath = relativeBase ? `${relativeBase}/${dirent.name}` : dirent.name;
    if (dirent.isDirectory()) {
      entries.push({ name: dirent.name, path: relativePath, type: "dir", size: 0 });
      entries.push(...listFilesRecursively(path.join(absoluteDir, dirent.name), relativePath));
    } else {
      const size = fs.statSync(path.join(absoluteDir, dirent.name)).size;
      entries.push({ name: dirent.name, path: relativePath, type: "file", size });
    }
  }
  return entries;
}

/*
 * Reads a file from the local git working tree.
 * Returns null when the file does not exist.
 */
export function readLocalFile(absolutePath: string): string | null {
  if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) {
    return null;
  }
  return fs.readFileSync(absolutePath, "utf-8");
}

/*
 * Reads a binary file from the local git working tree.
 * Returns null when the file does not exist.
 */
export function readLocalFileBuffer(absolutePath: string): Buffer | null {
  if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) {
    return null;
  }
  return fs.readFileSync(absolutePath);
}

/*
 * Writes content to a local path, creating parent directories as needed.
 */
export function writeLocalFile(absolutePath: string, content: string): void {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, "utf-8");
}

/*
 * Writes binary content to a local path, creating parent directories as needed.
 */
export function writeLocalFileBuffer(absolutePath: string, buffer: Buffer): void {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, buffer);
}

/*
 * Deletes a file or directory recursively from the local working tree.
 */
export function deleteLocalPath(absolutePath: string): void {
  if (!fs.existsSync(absolutePath)) {
    return;
  }
  const stats = fs.statSync(absolutePath);
  if (stats.isDirectory()) {
    fs.rmSync(absolutePath, { recursive: true, force: true });
  } else {
    fs.unlinkSync(absolutePath);
  }
}

/*
 * Returns git log entries for a specific file path relative to the repo root.
 */
export async function getFileHistory(
  repoRelativePath: string,
  maxCount: number
): Promise<Array<{ sha: string; authorName: string; date: string; message: string }>> {
  const repoRoot = getRepoRoot();
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["log", `--max-count=${maxCount}`, "--format=%H%n%an%n%ai%n%s%n---", "--", repoRelativePath],
      { cwd: repoRoot }
    );
    return stdout
      .split("---\n")
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        const [sha, authorName, date, ...messageParts] = block.split("\n");
        return { sha, authorName, date, message: messageParts.join("\n") };
      });
  } catch {
    return [];
  }
}

/*
 * Returns the content of a file at a specific commit SHA using git show.
 */
export async function getFileAtRevision(
  repoRelativePath: string,
  sha: string
): Promise<string> {
  const repoRoot = getRepoRoot();
  const { stdout } = await execFileAsync(
    "git",
    ["show", `${sha}:${repoRelativePath}`],
    { cwd: repoRoot }
  );
  return stdout;
}
