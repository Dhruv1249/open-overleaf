import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { LocalFileEntry } from "./types.ts";

export const execFileAsync = promisify(execFile);

export const DEPLOY_KEY_PATH = process.env.DEPLOY_KEY_PATH || "/run/secrets/deploy_key";
export const GIT_AUTHOR_NAME = process.env.GIT_AUTHOR_NAME || "open-overleaf-mcp";
export const GIT_AUTHOR_EMAIL = process.env.GIT_AUTHOR_EMAIL || "mcp@open-overleaf.local";
export const DEFAULT_BRANCH = process.env.DEFAULT_BRANCH || "main";
export const GITHUB_REPO_OWNER = process.env.GITHUB_SINGLE_REPO_OWNER || "";
export const GITHUB_REPO_NAME = process.env.GITHUB_SINGLE_REPO_NAME || "";

export function getProjectsDir(): string {
  return process.env.PROJECTS_DIR || path.join(process.cwd(), "projects");
}

export function isGitRepo(repoDir: string): boolean {
  return fs.existsSync(path.join(repoDir, ".git"));
}

export function buildSshCommandEnv(): Record<string, string> {
  return {
    GIT_SSH_COMMAND: `ssh -i ${DEPLOY_KEY_PATH} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`,
    GIT_AUTHOR_NAME,
    GIT_AUTHOR_EMAIL,
    GIT_COMMITTER_NAME: GIT_AUTHOR_NAME,
    GIT_COMMITTER_EMAIL: GIT_AUTHOR_EMAIL,
  };
}

export async function ensureRepoCloned(): Promise<void> {
  const projectsDir = getProjectsDir();
  if (isGitRepo(projectsDir)) {
    return;
  }
  if (!GITHUB_REPO_OWNER || !GITHUB_REPO_NAME) {
    return;
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

const LOCK_DIR = "/tmp/open-overleaf-git.lock";
const LOCK_TIMEOUT_MS = 25000;
const LOCK_STALE_MS = 30000;

let inProcessQueue: Promise<void> = Promise.resolve();

/**
 * Executes an async task holding an exclusive repository lock across all processes and threads.
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
          console.warn("[MCP RepoLock] Stale lock timeout exceeded, breaking lock");
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

  const indexLock = path.join(gitDir, "index.lock");
  try {
    if (fs.existsSync(indexLock)) {
      const stat = fs.statSync(indexLock);
      if (Date.now() - stat.mtimeMs > 3000) {
        fs.unlinkSync(indexLock);
        console.warn("[MCP Git] Removed stale .git/index.lock");
      }
    }
  } catch {}

  const rebaseApply = path.join(gitDir, "rebase-apply");
  const rebaseMerge = path.join(gitDir, "rebase-merge");
  if (fs.existsSync(rebaseApply) || fs.existsSync(rebaseMerge)) {
    console.warn("[MCP Git] Lingering rebase state detected, aborting cleanly...");
    try {
      await execFileAsync("git", ["rebase", "--abort"], { cwd: repoDir, env });
    } catch {}
  }

  const mergeHead = path.join(gitDir, "MERGE_HEAD");
  if (fs.existsSync(mergeHead)) {
    try {
      await execFileAsync("git", ["merge", "--abort"], { cwd: repoDir, env });
    } catch {}
  }
}

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
    console.warn(`[MCP Git] Remote sync skipped: ${pullErr.message}`);
    try {
      await execFileAsync("git", ["rebase", "--abort"], { cwd: repoDir, env });
    } catch {}
    return;
  }

  // Push to remote
  try {
    await execFileAsync("git", ["push", "origin", DEFAULT_BRANCH], {
      cwd: repoDir,
      env,
      timeout: 15000,
    });
    console.log(`[MCP Git] Synced with origin/${DEFAULT_BRANCH}`);
  } catch (pushErr: any) {
    console.warn(`[MCP Git] Push skipped: ${pushErr.message}`);
  }
}

export async function commitPullAndPush(
  commitMessage: string,
  mutation?: () => void | Promise<void>
): Promise<void> {
  return withRepoLock(async () => {
    const repoDir = getProjectsDir();
    const sshEnv = { ...process.env, ...buildSshCommandEnv() };

    await cleanStaleGitState(repoDir, sshEnv);

    if (mutation) {
      await mutation();
    }

    await execFileAsync("git", ["add", "-A"], { cwd: repoDir });
    const { stdout: statusOutput } = await execFileAsync("git", ["status", "--porcelain"], { cwd: repoDir });
    if (statusOutput.trim()) {
      await execFileAsync(
        "git",
        ["commit", "-m", commitMessage, "--author", `${GIT_AUTHOR_NAME} <${GIT_AUTHOR_EMAIL}>`],
        { cwd: repoDir, env: sshEnv }
      );
      console.log(`[MCP Git] Committed locally: ${commitMessage}`);
    }

    await syncRemote(repoDir, sshEnv);
  });
}

export function resolveSafePath(projectName: string, filePath: string): string {
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

export function listLocalFilesRecursively(absoluteDir: string, relativeBase: string): LocalFileEntry[] {
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
