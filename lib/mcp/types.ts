/**
 * Shared types for Open-Overleaf MCP Server.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface LocalFileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  type: string;
  sizeBytes: number;
}

export interface DiagnosticItem {
  file?: string;
  line?: number;
  type?: string;
  message: string;
  detail?: string;
}

export interface StructuredCompileResult {
  status: "success" | "error";
  pageCount: number;
  pdfFile: string;
  engine: string;
  errors: DiagnosticItem[];
  warnings: DiagnosticItem[];
  summary: string;
  runs: number;
  rawLogSnippet?: string;
}

export type ToolHandler = (toolArguments: Record<string, any>) => Promise<any>;
