import * as fs from "fs";
import * as path from "path";
import { resolveSafePath, commitPullAndPush } from "../git.ts";
import type { ToolDefinition } from "../types.ts";

export const assetToolDefinitions: ToolDefinition[] = [
  {
    name: "upload_project_asset",
    description: "Uploads or copies a binary asset (image, PDF, graphic) directly into a project folder (e.g. images/figure1.png) from a local file path or base64 string, and commits to Git.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the LaTeX project" },
        targetPath: { type: "string", description: "Relative destination path within project (e.g. images/architecture.png)" },
        sourceFilePath: { type: "string", description: "Local disk path of source file to copy into project (e.g. /tmp/plot.png or a local workspace file)" },
        base64Content: { type: "string", description: "Optional raw base64 string if supplying asset in-memory instead of a file path" },
      },
      required: ["projectName", "targetPath"],
    },
  },
];

export async function handleAssetTool(name: string, args: Record<string, any>): Promise<any> {
  if (name === "upload_project_asset") {
    const projectName = String(args?.projectName);
    const targetRelativePath = String(args?.targetPath);
    const sourceFilePath = args?.sourceFilePath ? String(args.sourceFilePath) : null;
    const base64Content = (args?.base64Content || args?.contentBase64)
      ? String(args.base64Content || args.contentBase64)
      : null;

    if (!sourceFilePath && !base64Content) {
      throw new Error("Either sourceFilePath or base64Content must be provided");
    }

    const absoluteTargetPath = resolveSafePath(projectName, targetRelativePath);
    fs.mkdirSync(path.dirname(absoluteTargetPath), { recursive: true });

    let fileBuffer: Buffer;
    if (sourceFilePath) {
      const resolvedSource = path.resolve(sourceFilePath);
      if (!fs.existsSync(resolvedSource)) {
        throw new Error(`Source file not found: ${resolvedSource}`);
      }
      fileBuffer = fs.readFileSync(resolvedSource);
    } else {
      fileBuffer = Buffer.from(base64Content!, "base64");
    }

    fs.writeFileSync(absoluteTargetPath, fileBuffer);

    // Also mirror to compile workdir so LaTeX sees it immediately
    const compileWorkPath = path.join("/tmp/oo-compile", projectName, targetRelativePath);
    try {
      fs.mkdirSync(path.dirname(compileWorkPath), { recursive: true });
      fs.writeFileSync(compileWorkPath, fileBuffer);
    } catch {}

    await commitPullAndPush(`feat: add asset ${targetRelativePath} in ${projectName}`);

    return {
      success: true,
      message: `Successfully uploaded asset to ${targetRelativePath} in project ${projectName}`,
      targetPath: targetRelativePath,
      sizeBytes: fileBuffer.length,
    };
  }

  throw new Error(`Unknown asset tool: ${name}`);
}
