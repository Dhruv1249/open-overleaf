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

const LOCK_DIR = "/tmp/open-overleaf-git.lock";
const LOCK_TIMEOUT_MS = 25000;
const LOCK_STALE_MS = 30000;

let inProcessQueue: Promise<void> = Promise.resolve();

/**
 * Executes an async task holding an exclusive repository lock across all processes and threads.
 * Prevents concurrent git mutations, index.lock conflicts, and unstaged-rebase race conditions.
 */
export async function withRepoLock<T>(fn: () => Promise<T>): Promise<T> {
  let resolveQueue: () => void = () => {};
  const currentQueue = inProcessQueue;
  inProcessQueue = new Promise<void>((resolve) => {
    resolveQueue = resolve;
  });

  try {
    await currentQueue;
  } catch {
    // Prevent prior errors from poisoning future queued tasks
  }

  const startTime = Date.now();
  let acquired = false;

  while (!acquired) {
    try {
      fs.mkdirSync(LOCK_DIR);
      acquired = true;
    } catch (err: any) {
      if (err.code === "EEXIST") {
        try {
          const stats = fs.statSync(LOCK_DIR);
          if (Date.now() - stats.mtimeMs > LOCK_STALE_MS) {
            try { fs.rmdirSync(LOCK_DIR); } catch {}
            continue;
          }
        } catch {
          continue;
        }

        if (Date.now() - startTime > LOCK_TIMEOUT_MS) {
          console.warn("[RepoLock] Stale lock timeout exceeded, breaking lock");
          try { fs.rmdirSync(LOCK_DIR); } catch {}
          continue;
        }

        await new Promise((resolve) => setTimeout(resolve, 30));
      } else {
        break;
      }
    }
  }

  try {
    return await fn();
  } finally {
    if (acquired) {
      try {
        fs.rmdirSync(LOCK_DIR);
      } catch {}
    }
    resolveQueue();
  }
}

/**
 * Self-heals any leftover index.lock, rebase-in-progress, or merge-in-progress state.
 */
async function cleanStaleGitState(repoDir: string, env: NodeJS.ProcessEnv): Promise<void> {
  const gitDir = path.join(repoDir, ".git");
  if (!fs.existsSync(gitDir)) return;

  // Stale index.lock removal (> 3s old)
  const indexLock = path.join(gitDir, "index.lock");
  try {
    if (fs.existsSync(indexLock)) {
      const stat = fs.statSync(indexLock);
      if (Date.now() - stat.mtimeMs > 3000) {
        fs.unlinkSync(indexLock);
        console.warn("[Git] Removed stale .git/index.lock");
      }
    }
  } catch {}

  // Abort any leftover / crashed rebase
  const rebaseApply = path.join(gitDir, "rebase-apply");
  const rebaseMerge = path.join(gitDir, "rebase-merge");
  if (fs.existsSync(rebaseApply) || fs.existsSync(rebaseMerge)) {
    console.warn("[Git] Lingering rebase state detected, aborting cleanly...");
    try {
      await execFileAsync("git", ["rebase", "--abort"], { cwd: repoDir, env });
    } catch {}
  }

  // Abort any lingering merge
  const mergeHead = path.join(gitDir, "MERGE_HEAD");
  if (fs.existsSync(mergeHead)) {
    try {
      await execFileAsync("git", ["merge", "--abort"], { cwd: repoDir, env });
    } catch {}
  }
}

/**
 * Safely pulls remote changes with rebase and pushes local commits.
 * Never leaves repository in an aborted or dirty state on network/merge errors.
 */
async function syncRemote(repoDir: string, env: NodeJS.ProcessEnv): Promise<void> {
  const gitDir = path.join(repoDir, ".git");
  if (!fs.existsSync(gitDir)) return;

  try {
    const { stdout: remotes } = await execFileAsync("git", ["remote"], { cwd: repoDir });
    if (!remotes.split("\n").map((r) => r.trim()).includes("origin")) {
      return;
    }
  } catch {
    return;
  }

  // Guarantee clean working tree before pulling
  try {
    const { stdout: dirtyCheck } = await execFileAsync("git", ["status", "--porcelain"], { cwd: repoDir });
    if (dirtyCheck.trim()) {
      await execFileAsync("git", ["add", "-A"], { cwd: repoDir });
      await execFileAsync(
        "git",
        ["commit", "-m", "chore: save working tree before sync", "--author", `${GIT_AUTHOR_NAME} <${GIT_AUTHOR_EMAIL}>`],
        { cwd: repoDir, env }
      );
    }
  } catch {}

  // Pull with rebase
  try {
    await execFileAsync("git", ["pull", "--rebase", "origin", DEFAULT_BRANCH], {
      cwd: repoDir,
      env,
      timeout: 15000,
    });
  } catch (pullErr: any) {
    console.warn(`[Git] Pull --rebase skipped/failed: ${pullErr.message}`);
    try {
      await execFileAsync("git", ["rebase", "--abort"], { cwd: repoDir, env });
    } catch {}
    return;
  }

  // Push local commits to remote
  try {
    await execFileAsync("git", ["push", "origin", DEFAULT_BRANCH], {
      cwd: repoDir,
      env,
      timeout: 15000,
    });
    console.log(`[Git] Synced with origin/${DEFAULT_BRANCH}`);
  } catch (pushErr: any) {
    console.warn(`[Git] Push failed: ${pushErr.message}`);
  }
}

/*
 * Stages all changes, commits, and syncs with remote under an exclusive cross-process lock.
 * If a mutation callback is provided, it is executed strictly inside the lock before staging.
 */
export async function commitPullAndPush(
  commitMessage: string,
  mutation?: () => void | Promise<void>
): Promise<void> {
  return withRepoLock(async () => {
    const repoDir = getRepoRoot();
    const env = buildGitEnv();

    // 1. Clean any stale index lock or interrupted rebase state
    await cleanStaleGitState(repoDir, env);

    // 2. Perform the filesystem mutation inside the lock (if provided)
    if (mutation) {
      await mutation();
    }

    // 3. Stage all modifications
    await execFileAsync("git", ["add", "-A"], { cwd: repoDir });

    // 4. Commit if changes are present
    const { stdout: status } = await execFileAsync("git", ["status", "--porcelain"], { cwd: repoDir });
    if (status.trim()) {
      await execFileAsync(
        "git",
        ["commit", "-m", commitMessage, "--author", `${GIT_AUTHOR_NAME} <${GIT_AUTHOR_EMAIL}>`],
        { cwd: repoDir, env }
      );
      console.log(`[Git] Committed locally: ${commitMessage}`);
    }

    // 5. Sync to remote
    await syncRemote(repoDir, env);
  });
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
