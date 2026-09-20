import crypto from "crypto";

/**
 * Computes or retrieves the active MCP authentication token using configured secrets.
 */
export function getEffectiveMCPToken(): string {
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
