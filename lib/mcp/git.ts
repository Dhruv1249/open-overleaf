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

/*
 * Serializes all git write operations so concurrent MCP calls never corrupt the working tree.
 */
let gitOperationQueue: Promise<void> = Promise.resolve();

export function getProjectsDir(): string {
  return process.env.PROJECTS_DIR || path.join(process.cwd(), "projects");
}

/*
 * Builds the GIT_SSH_COMMAND environment string that points git at the repo-scoped deploy key.
 */
export function buildSshCommandEnv(): Record<string, string> {
  return {
    GIT_SSH_COMMAND: `ssh -i ${DEPLOY_KEY_PATH} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`,
    GIT_AUTHOR_NAME,
    GIT_AUTHOR_EMAIL,
    GIT_COMMITTER_NAME: GIT_AUTHOR_NAME,
    GIT_COMMITTER_EMAIL: GIT_AUTHOR_EMAIL,
  };
}

export function isGitRepo(repoDir: string): boolean {
  return fs.existsSync(path.join(repoDir, ".git"));
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

export async function commitPullAndPush(commitMessage: string): Promise<void> {
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
    try {
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
    } catch (remoteError: any) {
      if (process.env.NODE_ENV === "test" || !process.env.GITHUB_CLIENT_SECRET) {
        console.warn(`[MCP Git] Remote sync skipped: ${remoteError.message}`);
      } else {
        throw remoteError;
      }
    }
    console.log(`[MCP Git] Committed and pushed: ${commitMessage}`);
  });
  return gitOperationQueue;
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
