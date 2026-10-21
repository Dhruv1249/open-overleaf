import { fileToolDefinitions, handleFileTool } from "./tools/files.ts";
import { compileToolDefinitions, handleCompileTool } from "./tools/compile.ts";
import { previewToolDefinitions, handlePreviewTool } from "./tools/preview.ts";
import { assetToolDefinitions, handleAssetTool } from "./tools/assets.ts";
import { checkpointToolDefinitions, handleCheckpointTool } from "./tools/checkpoints.ts";
import { envToolDefinitions, handleEnvTool } from "./tools/env.ts";
import type { ToolDefinition } from "./types.ts";

export const allToolDefinitions: ToolDefinition[] = [
  ...fileToolDefinitions,
  ...compileToolDefinitions,
  ...previewToolDefinitions,
  ...assetToolDefinitions,
  ...checkpointToolDefinitions,
  ...envToolDefinitions,
];

const toolHandlers: Record<string, (name: string, args: Record<string, any>) => Promise<any>> = {};

for (const tool of fileToolDefinitions) {
  toolHandlers[tool.name] = handleFileTool;
}
for (const tool of compileToolDefinitions) {
  toolHandlers[tool.name] = handleCompileTool;
}
for (const tool of previewToolDefinitions) {
  toolHandlers[tool.name] = handlePreviewTool;
}
for (const tool of assetToolDefinitions) {
  toolHandlers[tool.name] = handleAssetTool;
}
for (const tool of checkpointToolDefinitions) {
  toolHandlers[tool.name] = handleCheckpointTool;
}
for (const tool of envToolDefinitions) {
  toolHandlers[tool.name] = handleEnvTool;
}

export async function executeTool(name: string, args: Record<string, any>): Promise<any> {
  const handler = toolHandlers[name];
  if (!handler) {
    throw new Error(`Unknown MCP tool requested: ${name}`);
  }
  return await handler(name, args);
}
