import * as fs from "fs";
import * as path from "path";
import { execFileAsync, getProjectsDir, resolveSafePath, commitPullAndPush } from "../git.ts";
import type { ToolDefinition } from "../types.ts";

export const checkpointToolDefinitions: ToolDefinition[] = [
  {
    name: "create_checkpoint",
    description: "Creates a named Git checkpoint or milestone tag for a project. Allows you to safely experiment with major formatting/refactoring and roll back if things break.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        description: { type: "string", description: "Human-readable description of what this checkpoint represents (e.g. 'Working draft before table redesign')" },
        tag: { type: "string", description: "Optional short identifier (e.g. 'draft-v1')" },
      },
      required: ["projectName", "description"],
    },
  },
  {
    name: "rollback_to_checkpoint",
    description: "Restores a project's files to a previous checkpoint or git commit SHA. Automatically cleans build artifacts and commits the rollback state.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        checkpointId: { type: "string", description: "Git commit SHA or checkpoint tag to roll back to" },
      },
      required: ["projectName", "checkpointId"],
    },
  },
  {
    name: "list_checkpoints",
    description: "Lists all recent Git commits and tagged checkpoints for a project.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        limit: { type: "number", description: "Max number of checkpoints to retrieve (default: 20)" },
      },
      required: ["projectName"],
    },
  },
  {
    name: "get_file_history",
    description: "Retrieves the Git commit history for a specific file in a project.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        filePath: { type: "string", description: "Relative file path" },
        perPage: { type: "number", description: "Number of commits to return (default: 30)" },
      },
      required: ["projectName", "filePath"],
    },
  },
  {
    name: "get_file_at_revision",
    description: "Retrieves the content of a file at a specific Git revision or commit SHA.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        filePath: { type: "string", description: "Relative file path" },
        sha: { type: "string", description: "Git commit SHA" },
      },
      required: ["projectName", "filePath", "sha"],
    },
  },
];

export async function handleCheckpointTool(name: string, args: Record<string, any>): Promise<any> {
  const repoDir = getProjectsDir();

  if (name === "create_checkpoint") {
    const projectName = String(args?.projectName);
    const description = String(args?.description || args?.message || "Checkpoint");
    const customTag = args?.tag ? String(args.tag).trim().replace(/[^a-zA-Z0-9_\-]/g, "_") : null;
    const checkpointTag = customTag || `ckpt_${projectName}_${Date.now()}`;

    // Commit any pending changes first
    await commitPullAndPush(`checkpoint: ${description}`);

    let commitSha = "";
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoDir });
      commitSha = stdout.trim();
    } catch {}

    try {
      await execFileAsync("git", ["tag", "-a", checkpointTag, "-m", description], { cwd: repoDir });
    } catch {
      // Tag may already exist or lightweight fallback
    }

    return {
      success: true,
      message: `Created checkpoint '${checkpointTag}' for project ${projectName}`,
      tag: checkpointTag,
      commitSha,
      description,
    };
  }

  if (name === "rollback_to_checkpoint") {
    const projectName = String(args?.projectName);
    const checkpointId = String(args?.checkpointId || args?.tag || "").trim();
    if (!checkpointId) {
      throw new Error("checkpointId or tag must be provided");
    }
    const projectFolder = resolveSafePath(projectName, ".");
    const relativeProjectDir = path.relative(repoDir, projectFolder);

    // Verify commit / tag exists
    try {
      await execFileAsync("git", ["rev-parse", "--verify", checkpointId], { cwd: repoDir });
    } catch {
      throw new Error(`Checkpoint or commit '${checkpointId}' not found in Git repository`);
    }

    // Checkout project directory at that commit
    await execFileAsync("git", ["checkout", checkpointId, "--", relativeProjectDir], { cwd: repoDir });

    // Commit rollback state
    await commitPullAndPush(`rollback: restore ${projectName} to ${checkpointId}`);

    // Clear stale compile artifacts
    const compileDir = path.join("/tmp/oo-compile", projectName);
    if (fs.existsSync(compileDir)) {
      try {
        fs.rmSync(compileDir, { recursive: true, force: true });
      } catch {}
    }

    return {
      success: true,
      message: `Successfully rolled back ${projectName} to checkpoint ${checkpointId}`,
      restoredCheckpoint: checkpointId,
    };
  }

  if (name === "list_checkpoints") {
    const _projectName = String(args?.projectName);
    const limit = Math.min(Math.max(parseInt(String(args?.limit || "20"), 10), 1), 50);

    try {
      const tagMap: Record<string, string[]> = {};
      try {
        const tagFormat = "%(refname:short)%09%(if)%(*objectname)%(then)%(*objectname)%(else)%(objectname)%(end)";
        const { stdout: tagOut } = await execFileAsync("git", ["tag", "-l", `--format=${tagFormat}`], { cwd: repoDir });
        for (const line of tagOut.trim().split("\n").filter(Boolean)) {
          const [tName, tSha] = line.split("\t");
          if (tSha) {
            if (!tagMap[tSha]) tagMap[tSha] = [];
            tagMap[tSha].push(tName);
          }
        }
      } catch {}

      const { stdout } = await execFileAsync(
        "git",
        [
          "log",
          `-${limit}`,
          "--pretty=format:%H%x09%h%x09%an%x09%ad%x09%s",
          "--date=iso",
        ],
        { cwd: repoDir }
      );

      const commits = stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [sha, shortSha, author, date, ...msgParts] = line.split("\t");
          const commitTags = tagMap[sha] || [];
          return {
            sha,
            shortSha,
            author,
            date,
            message: msgParts.join("\t"),
            isCheckpoint: msgParts.join("\t").toLowerCase().startsWith("checkpoint:") || commitTags.length > 0,
            tags: commitTags,
            tag: commitTags[0] || null,
          };
        });

      return { checkpoints: commits, total: commits.length };
    } catch (err: any) {
      return { checkpoints: [], total: 0, error: err.message };
    }
  }

  if (name === "get_file_history") {
    const projectName = String(args?.projectName);
    const filePath = String(args?.filePath);
    const perPage = Math.min(parseInt(String(args?.perPage || "30"), 10), 100);
    const absoluteFilePath = resolveSafePath(projectName, filePath);
    const relativePathInRepo = path.relative(repoDir, absoluteFilePath);

    try {
      const { stdout } = await execFileAsync(
        "git",
        [
          "log",
          `-${perPage}`,
          "--pretty=format:%H%x09%h%x09%an%x09%ad%x09%s",
          "--date=iso",
          "--",
          relativePathInRepo,
        ],
        { cwd: repoDir }
      );
      const commits = stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [sha, shortSha, author, date, ...msgParts] = line.split("\t");
          return { sha, shortSha, author, date, message: msgParts.join("\t") };
        });
      return { commits };
    } catch {
      return { commits: [] };
    }
  }

  if (name === "get_file_at_revision") {
    const projectName = String(args?.projectName);
    const filePath = String(args?.filePath);
    const sha = String(args?.sha);
    const absoluteFilePath = resolveSafePath(projectName, filePath);
    const relativePathInRepo = path.relative(repoDir, absoluteFilePath);

    try {
      const { stdout } = await execFileAsync("git", ["show", `${sha}:${relativePathInRepo}`], { cwd: repoDir });
      return { content: stdout };
    } catch (e: any) {
      throw new Error(`Failed to retrieve ${filePath} at ${sha}: ${e.message}`);
    }
  }

  throw new Error(`Unknown checkpoint tool: ${name}`);
}
