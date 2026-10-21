import * as fs from "fs";
import * as path from "path";
import {
  execFileAsync,
  getProjectsDir,
  resolveSafePath,
  commitPullAndPush,
  listLocalFilesRecursively,
} from "../git.ts";
import type { ToolDefinition } from "../types.ts";

export const fileToolDefinitions: ToolDefinition[] = [
  {
    name: "list_projects",
    description: "Lists all LaTeX projects stored in open-overleaf.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_files",
    description: "Lists files and directories inside a target LaTeX project.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        subDir: { type: "string", description: "Optional sub-directory path relative to project root" },
      },
      required: ["projectName"],
    },
  },
  {
    name: "read_project_file",
    description: "Reads the complete UTF-8 content of a file in the project.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        filePath: { type: "string", description: "Relative file path (e.g. main.tex, sections/intro.tex)" },
      },
      required: ["projectName", "filePath"],
    },
  },
  {
    name: "read_file_lines",
    description: "Reads a specific line range from a file (1-indexed, inclusive). Useful for inspecting sections without loading entire documents.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        filePath: { type: "string", description: "Relative file path" },
        startLine: { type: "number", description: "1-based starting line number" },
        endLine: { type: "number", description: "1-based ending line number" },
      },
      required: ["projectName", "filePath", "startLine", "endLine"],
    },
  },
  {
    name: "write_project_file",
    description: "Writes or overwrites the full content of a file, then commits and pushes to Git.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        filePath: { type: "string", description: "Relative file path" },
        content: { type: "string", description: "Full UTF-8 content to write" },
      },
      required: ["projectName", "filePath", "content"],
    },
  },
  {
    name: "edit_project_file",
    description: "Performs a targeted search-and-replace edit on an existing file without having to rewrite the entire document. Finds 'target' and replaces it with 'replacement'.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        filePath: { type: "string", description: "Relative file path (e.g. main.tex)" },
        target: { type: "string", description: "Exact string or snippet to find and replace" },
        replacement: { type: "string", description: "New replacement string" },
        replaceAll: { type: "boolean", description: "If true, replaces all occurrences instead of only the first (default: false)" },
      },
      required: ["projectName", "filePath", "target", "replacement"],
    },
  },
  {
    name: "batch_write_files",
    description: "Creates or updates multiple files in a project in a single atomic operation with one unified Git commit. Ideal for modular project scaffolding.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        files: {
          type: "array",
          description: "List of files to write",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "Relative path of the file" },
              content: { type: "string", description: "UTF-8 content of the file" },
            },
            required: ["path", "content"],
          },
        },
        commitMessage: { type: "string", description: "Optional Git commit message" },
      },
      required: ["projectName", "files"],
    },
  },
  {
    name: "create_file",
    description: "Creates a new file in the project. Fails if the file already exists.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        filePath: { type: "string", description: "Relative file path" },
        content: { type: "string", description: "Initial UTF-8 content (default empty)" },
      },
      required: ["projectName", "filePath"],
    },
  },
  {
    name: "delete_file",
    description: "Deletes a file from the project, then commits and pushes to Git.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        filePath: { type: "string", description: "Relative file path" },
      },
      required: ["projectName", "filePath"],
    },
  },
  {
    name: "rename_file",
    description: "Renames or moves a file within the project, then commits and pushes to Git.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        fromPath: { type: "string", description: "Current relative file path" },
        toPath: { type: "string", description: "New relative file path" },
      },
      required: ["projectName", "fromPath", "toPath"],
    },
  },
  {
    name: "apply_patch",
    description: "Applies targeted chunk-based replacements to a file, commits, and pushes.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        filePath: { type: "string", description: "Relative file path" },
        patches: {
          type: "array",
          items: {
            type: "object",
            properties: {
              startLine: { type: "number" },
              endLine: { type: "number" },
              originalContent: { type: "string" },
              newContent: { type: "string" },
            },
            required: ["startLine", "endLine", "originalContent", "newContent"],
          },
        },
      },
      required: ["projectName", "filePath", "patches"],
    },
  },
  {
    name: "search_in_project",
    description: "Searches for text in all files in the project. Returns matching files, line numbers, and snippets.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        query: { type: "string", description: "Text or regex to search for" },
        isRegex: { type: "boolean", description: "Whether query is a regular expression" },
        caseSensitive: { type: "boolean", description: "Whether search is case-sensitive" },
      },
      required: ["projectName", "query"],
    },
  },
  {
    name: "validate_tex",
    description: "Quickly validates a .tex file for common syntax issues: unmatched braces, unescaped characters, unclosed environments.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        filePath: { type: "string", description: "Relative path of .tex file to validate" },
      },
      required: ["projectName", "filePath"],
    },
  },
];

export async function handleFileTool(name: string, args: Record<string, any>): Promise<any> {
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
    const projectName = String(args?.projectName);
    const subDirectory = String(args?.subDir || "");
    const absoluteProjectDir = resolveSafePath(projectName, subDirectory || ".");
    const entries = listLocalFilesRecursively(absoluteProjectDir, subDirectory);
    return { files: entries };
  }

  if (name === "read_project_file") {
    const projectName = String(args?.projectName);
    const filePath = String(args?.filePath);
    const absoluteFilePath = resolveSafePath(projectName, filePath);
    if (!fs.existsSync(absoluteFilePath)) {
      throw new Error(`File not found: ${filePath} in project ${projectName}`);
    }
    const fileContent = fs.readFileSync(absoluteFilePath, "utf-8");
    return { content: fileContent };
  }

  if (name === "read_file_lines") {
    const projectName = String(args?.projectName);
    const filePath = String(args?.filePath);
    const startLineNumber = parseInt(String(args?.startLine), 10);
    const endLineNumber = parseInt(String(args?.endLine), 10);
    const absoluteFilePath = resolveSafePath(projectName, filePath);
    if (!fs.existsSync(absoluteFilePath)) {
      throw new Error(`File not found: ${filePath} in project ${projectName}`);
    }
    const fullContent = fs.readFileSync(absoluteFilePath, "utf-8");
    const contentLines = fullContent.split("\n");
    const extractedLines = contentLines.slice(
      Math.max(0, startLineNumber - 1),
      Math.min(contentLines.length, endLineNumber)
    );
    return {
      lines: extractedLines.join("\n"),
      totalLines: contentLines.length,
      startLine: startLineNumber,
      endLine: Math.min(contentLines.length, endLineNumber),
    };
  }

  if (name === "write_project_file") {
    const projectName = String(args?.projectName);
    const filePath = String(args?.filePath);
    const content = String(args?.content ?? "");
    const absoluteFilePath = resolveSafePath(projectName, filePath);
    fs.mkdirSync(path.dirname(absoluteFilePath), { recursive: true });
    fs.writeFileSync(absoluteFilePath, content, "utf-8");

    const compileWorkPath = path.join("/tmp/oo-compile", projectName, filePath);
    try {
      fs.mkdirSync(path.dirname(compileWorkPath), { recursive: true });
      fs.writeFileSync(compileWorkPath, content, "utf-8");
    } catch {}

    await commitPullAndPush(`mcp: write ${projectName}/${filePath}`);
    return { success: true, message: `Successfully wrote ${filePath} in project ${projectName}` };
  }

  if (name === "edit_project_file") {
    const projectName = String(args?.projectName);
    const filePath = String(args?.filePath);
    const target = String(args?.target ?? "");
    const replacement = String(args?.replacement ?? "");
    const replaceAll = Boolean(args?.replaceAll);

    if (!target) {
      throw new Error("Target string to replace cannot be empty");
    }

    const absoluteFilePath = resolveSafePath(projectName, filePath);
    if (!fs.existsSync(absoluteFilePath)) {
      throw new Error(`File not found: ${filePath} in project ${projectName}`);
    }

    const currentContent = fs.readFileSync(absoluteFilePath, "utf-8");
    if (!currentContent.includes(target)) {
      throw new Error(`Target snippet not found in ${filePath}`);
    }

    const newContent = replaceAll
      ? currentContent.split(target).join(replacement)
      : currentContent.replace(target, replacement);

    fs.writeFileSync(absoluteFilePath, newContent, "utf-8");

    const compileWorkPath = path.join("/tmp/oo-compile", projectName, filePath);
    try {
      if (fs.existsSync(compileWorkPath)) {
        fs.writeFileSync(compileWorkPath, newContent, "utf-8");
      }
    } catch {}

    await commitPullAndPush(`mcp: edit ${projectName}/${filePath}`);
    const repCount = replaceAll ? currentContent.split(target).length - 1 : 1;
    return {
      success: true,
      message: `Successfully edited ${filePath} in project ${projectName}`,
      occurrencesReplaced: repCount,
      replacementsCount: repCount,
    };
  }

  if (name === "batch_write_files") {
    const projectName = String(args?.projectName);
    const files = args?.files;
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error("files array must be provided and non-empty");
    }

    const writtenPaths: string[] = [];
    for (const f of files) {
      const filePath = String(f.path);
      const content = String(f.content ?? "");
      const absoluteFilePath = resolveSafePath(projectName, filePath);

      fs.mkdirSync(path.dirname(absoluteFilePath), { recursive: true });
      fs.writeFileSync(absoluteFilePath, content, "utf-8");

      const compileWorkPath = path.join("/tmp/oo-compile", projectName, filePath);
      try {
        fs.mkdirSync(path.dirname(compileWorkPath), { recursive: true });
        fs.writeFileSync(compileWorkPath, content, "utf-8");
      } catch {}

      writtenPaths.push(filePath);
    }

    const commitMsg = String(args?.commitMessage || `mcp: batch write ${writtenPaths.length} file(s) in ${projectName}`);
    await commitPullAndPush(commitMsg);

    return {
      success: true,
      message: `Successfully wrote ${writtenPaths.length} file(s) in ${projectName}`,
      files: writtenPaths,
      filesWritten: writtenPaths.length,
    };
  }

  if (name === "create_file") {
    const projectName = String(args?.projectName);
    const filePath = String(args?.filePath);
    const fileContent = String(args?.content ?? "");
    const absoluteFilePath = resolveSafePath(projectName, filePath);
    if (fs.existsSync(absoluteFilePath)) {
      throw new Error(`File already exists: ${filePath} in project ${projectName}`);
    }
    fs.mkdirSync(path.dirname(absoluteFilePath), { recursive: true });
    fs.writeFileSync(absoluteFilePath, fileContent, "utf-8");
    await commitPullAndPush(`mcp: create ${projectName}/${filePath}`);
    return { message: `Successfully created file ${filePath} in project ${projectName}` };
  }

  if (name === "delete_file") {
    const projectName = String(args?.projectName);
    const filePath = String(args?.filePath);
    const absoluteFilePath = resolveSafePath(projectName, filePath);
    if (!fs.existsSync(absoluteFilePath)) {
      throw new Error(`File not found: ${filePath} in project ${projectName}`);
    }
    const isDirectory = fs.statSync(absoluteFilePath).isDirectory();
    if (isDirectory) {
      fs.rmSync(absoluteFilePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(absoluteFilePath);
    }
    await commitPullAndPush(`mcp: delete ${projectName}/${filePath}`);
    return { message: `Successfully deleted ${filePath} from project ${projectName}` };
  }

  if (name === "rename_file") {
    const projectName = String(args?.projectName);
    const sourceRelativePath = String(args?.fromPath);
    const targetRelativePath = String(args?.toPath);
    const absoluteSourcePath = resolveSafePath(projectName, sourceRelativePath);
    const absoluteTargetPath = resolveSafePath(projectName, targetRelativePath);
    if (!fs.existsSync(absoluteSourcePath)) {
      throw new Error(`Source file not found: ${sourceRelativePath} in project ${projectName}`);
    }
    fs.mkdirSync(path.dirname(absoluteTargetPath), { recursive: true });
    fs.renameSync(absoluteSourcePath, absoluteTargetPath);
    await commitPullAndPush(`mcp: rename ${projectName}/${sourceRelativePath} → ${targetRelativePath}`);
    return { message: `Successfully renamed ${sourceRelativePath} to ${targetRelativePath}` };
  }

  if (name === "apply_patch") {
    const projectName = String(args?.projectName);
    const filePath = String(args?.filePath);
    const patches = args?.patches;

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
        const needle = originalContent.trim();
        for (let idx = 0; idx <= lines.length - (endLine - startLine + 1); idx++) {
          const windowBlock = lines.slice(idx, idx + (endLine - startLine + 1)).join("\n");
          if (windowBlock.trim() === needle) {
            actualStartLine = idx + 1;
            actualEndLine = idx + (endLine - startLine + 1);
            matched = true;
            break;
          }
        }
      }

      if (!matched) {
        throw new Error(
          `Patch failed: originalContent does not match lines ${startLine}-${endLine} in ${filePath}`
        );
      }

      const replacementLines = newContent.split("\n");
      lines.splice(actualStartLine - 1, actualEndLine - actualStartLine + 1, ...replacementLines);
    }

    const patchedContent = lines.join("\n");
    fs.writeFileSync(absoluteFilePath, patchedContent, "utf-8");

    const compileWorkPath = path.join("/tmp/oo-compile", projectName, filePath);
    try {
      if (fs.existsSync(compileWorkPath)) {
        fs.writeFileSync(compileWorkPath, patchedContent, "utf-8");
      }
    } catch {}

    await commitPullAndPush(`mcp: patch ${projectName}/${filePath} (${patches.length} chunk(s))`);
    return { message: `Successfully applied ${patches.length} patch(es) to ${filePath}` };
  }

  if (name === "search_in_project") {
    const projectName = String(args?.projectName);
    const searchQuery = String(args?.query);
    const isRegex = Boolean(args?.isRegex);
    const caseSensitive = Boolean(args?.caseSensitive);
    const absoluteProjectDir = resolveSafePath(projectName, ".");

    let compiledPattern: RegExp;
    try {
      compiledPattern = isRegex
        ? new RegExp(searchQuery, caseSensitive ? "g" : "gi")
        : new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), caseSensitive ? "g" : "gi");
    } catch (e: any) {
      throw new Error(`Invalid search pattern: ${e.message}`);
    }

    const allProjectFiles = listLocalFilesRecursively(absoluteProjectDir, "");
    const matchingResults: Array<{ file: string; line: number; text: string }> = [];

    for (const fileEntry of allProjectFiles) {
      if (fileEntry.isDirectory) continue;
      const lower = fileEntry.name.toLowerCase();
      if (!lower.endsWith(".tex") && !lower.endsWith(".bib") && !lower.endsWith(".cls") && !lower.endsWith(".sty") && !lower.endsWith(".md") && !lower.endsWith(".txt")) {
        continue;
      }
      try {
        const fullContent = fs.readFileSync(path.join(absoluteProjectDir, fileEntry.path), "utf-8");
        const fileLines = fullContent.split("\n");
        fileLines.forEach((lineText, zeroBasedIdx) => {
          if (compiledPattern.test(lineText)) {
            matchingResults.push({ file: fileEntry.path, line: zeroBasedIdx + 1, text: lineText.trim() });
          }
          compiledPattern.lastIndex = 0;
        });
      } catch {}
    }

    return { matches: matchingResults, totalMatches: matchingResults.length };
  }

  if (name === "validate_tex") {
    const projectName = String(args?.projectName);
    const filePath = String(args?.filePath);
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

  throw new Error(`Unknown file tool: ${name}`);
}
