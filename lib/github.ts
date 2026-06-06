import { verifySessionFromRequest } from "./session";

// Encode each path segment individually, preserving forward slashes
function encodePath(path: string): string {
  return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

async function ghFetch(path: string, req: Request, opts: { method?: string; body?: any } = {}) {
  const session = verifySessionFromRequest(req);
  const token = session?.access_token as string | undefined;
  const owner = process.env.GITHUB_SINGLE_REPO_OWNER;
  const repo = process.env.GITHUB_SINGLE_REPO_NAME;
  if (!owner || !repo) throw new Error("GITHUB_SINGLE_REPO_OWNER and GITHUB_SINGLE_REPO_NAME must be set");
  const url = `https://api.github.com/repos/${owner}/${repo}${path}`;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `token ${token}`;
  if (opts.body) headers["Content-Type"] = "application/json";
  const resp = await fetch(url, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GitHub API error: ${resp.status} ${text}`);
  }
  return resp.json();
}

export async function listTopLevelDirectories(req: Request) {
  const data = await ghFetch(`/contents?ref=${process.env.DEFAULT_BRANCH || "main"}`, req);
  if (!Array.isArray(data)) return [];
  return data
    .filter((item: any) => item.type === "dir")
    .map((d: any) => ({ name: d.name, path: d.path }));
}

export async function readFileAtPath(path: string, req: Request) {
  const data = await ghFetch(
    `/contents/${encodePath(path)}?ref=${process.env.DEFAULT_BRANCH || "main"}`,
    req
  );
  // data.content is a base64 string. Empty files have content === "" (falsy but valid).
  if (data && data.content != null) {
    return Buffer.from(data.content, "base64").toString("utf8");
  }
  return null;
}

export async function getFileMeta(path: string, req: Request) {
  const data = await ghFetch(
    `/contents/${encodePath(path)}?ref=${process.env.DEFAULT_BRANCH || "main"}`,
    req
  );
  return data;
}

export async function listDirectory(path: string, req: Request) {
  const data = await ghFetch(
    `/contents/${encodePath(path)}?ref=${process.env.DEFAULT_BRANCH || "main"}`,
    req
  );
  if (!Array.isArray(data)) return [];
  return data.map((item: any) => ({ name: item.name, path: item.path, type: item.type }));
}

export async function putFileAtPath(
  path: string,
  content: string,
  message: string,
  req: Request,
  sha?: string
) {
  const body: any = {
    message: message || `Update ${path}`,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch: process.env.DEFAULT_BRANCH || "main",
  };
  if (sha) body.sha = sha;
  return ghFetch(`/contents/${encodePath(path)}`, req, { method: "PUT", body });
}

/** Binary-safe variant — accepts a Buffer instead of a string. */
export async function putBinaryAtPath(
  path: string,
  buffer: Buffer,
  message: string,
  req: Request,
  sha?: string
) {
  const body: any = {
    message: message || `Upload ${path}`,
    content: buffer.toString("base64"),
    branch: process.env.DEFAULT_BRANCH || "main",
  };
  if (sha) body.sha = sha;
  return ghFetch(`/contents/${encodePath(path)}`, req, { method: "PUT", body });
}


export async function deleteFileAtPath(
  path: string,
  message: string,
  sha: string,
  req: Request
) {
  const body = {
    message: message || `Delete ${path}`,
    sha,
    branch: process.env.DEFAULT_BRANCH || "main",
  };
  return ghFetch(`/contents/${encodePath(path)}`, req, { method: "DELETE", body });
}

/**
 * Recursively collect all file paths + SHAs inside a GitHub directory.
 * dirPath is the repo-root-relative path (e.g. "myproject/chapters").
 */
export async function listAllFilesInDir(
  dirPath: string,
  req: Request
): Promise<Array<{ path: string; sha: string }>> {
  const entries = await listDirectory(dirPath, req);
  const results: Array<{ path: string; sha: string }> = [];
  for (const entry of entries) {
    if (entry.type === "file") {
      // entry.path is the full repo-relative path returned by GitHub
      const meta = await ghFetch(
        `/contents/${encodePath(entry.path)}?ref=${process.env.DEFAULT_BRANCH || "main"}`,
        req
      );
      results.push({ path: entry.path, sha: meta.sha });
    } else if (entry.type === "dir") {
      const sub = await listAllFilesInDir(entry.path, req);
      results.push(...sub);
    }
  }
  return results;
}

/**
 * Delete an entire directory by recursively deleting every file inside it.
 * GitHub has no directory-delete API; directories vanish once empty.
 */
export async function deleteDirectoryAtPath(
  dirPath: string,
  req: Request
): Promise<void> {
  const files = await listAllFilesInDir(dirPath, req);
  for (const { path, sha } of files) {
    await deleteFileAtPath(path, `Delete ${path}`, sha, req);
  }
}

