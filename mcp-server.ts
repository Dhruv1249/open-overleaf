import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(process.cwd(), "projects");
const MCP_PORT = parseInt(process.env.MCP_PORT || "3202", 10);
const MCP_TOKEN = process.env.OVERLEAF_MCP_TOKEN || "";

/**
 * Diagnostic error detail extracted from LaTeX log output.
 */
interface DiagnosticError {
  line?: number;
  message: string;
  snippet?: string;
}

/**
 * Structured diagnostics result parsed from TeX compilation logs.
 */
interface TeXDiagnostics {
  hasErrors: boolean;
  errors: DiagnosticError[];
  missingPackages: string[];
}

/**
 * Validates and resolves project file paths to prevent directory traversal outside PROJECTS_DIR.
 */
function resolveSafePath(projectName: string, filePath: string): string {
  const resolvedProjectFolder = path.resolve(PROJECTS_DIR, projectName);
  const resolvedTargetFile = path.resolve(resolvedProjectFolder, filePath);

  if (!resolvedTargetFile.startsWith(resolvedProjectFolder)) {
    throw new Error(`Security Violation: Access denied for path ${filePath}`);
  }

  return resolvedTargetFile;
}

/**
 * Parses raw LaTeX stdout and stderr logs into structured error line numbers and messages.
 */
function parseTeXDiagnostics(stdoutOutput: string, stderrOutput: string): TeXDiagnostics {
  const errorList: DiagnosticError[] = [];
  const missingPackageSet = new Set<string>();

  const logLines = (stdoutOutput + "\n" + stderrOutput).split("\n");
  for (let index = 0; index < logLines.length; index++) {
    const currentLine = logLines[index];

    if (currentLine.startsWith("! ")) {
      const errorMessage = currentLine.substring(2).trim();
      let lineNumber: number | undefined = undefined;
      let codeSnippet = "";

      for (let lookahead = 1; lookahead <= 5 && index + lookahead < logLines.length; lookahead++) {
        const nextLine = logLines[index + lookahead];
        const lineMatch = nextLine.match(/^l\.(\d+)/);
        if (lineMatch) {
          lineNumber = parseInt(lineMatch[1], 10);
          codeSnippet = nextLine.trim();
          break;
        }
      }

      errorList.push({
        line: lineNumber,
        message: errorMessage,
        snippet: codeSnippet,
      });
    }

    const packageMatch = currentLine.match(/LaTeX Error: File `([^']+)' not found/);
    if (packageMatch) {
      missingPackageSet.add(packageMatch[1]);
    }
  }

  return {
    hasErrors: errorList.length > 0,
    errors: errorList,
    missingPackages: Array.from(missingPackageSet),
  };
}

/**
 * Inspects compiled PDF using pdfinfo to count total rendered pages.
 */
async function getPDFPageCount(pdfFilePath: string): Promise<number> {
  if (!fs.existsSync(pdfFilePath)) {
    return 0;
  }

  try {
    const { stdout } = await execAsync(`pdfinfo "${pdfFilePath}"`);
    const pageMatch = stdout.match(/Pages:\s+(\d+)/);
    if (pageMatch) {
      return parseInt(pageMatch[1], 10);
    }
  } catch {
    return 0;
  }

  return 0;
}

/**
 * Core execution engine carrying out individual MCP tool logic.
 */
async function executeMCPTool(name: string, toolArguments: Record<string, any>): Promise<any> {
  if (name === "list_projects") {
    if (!fs.existsSync(PROJECTS_DIR)) {
      fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    }
    const directoryEntries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
    const projectNamesList = directoryEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    return { projects: projectNamesList };
  }

  if (name === "read_project_file") {
    const projectName = String(toolArguments?.projectName);
    const filePath = String(toolArguments?.filePath);
    const targetFullPath = resolveSafePath(projectName, filePath);

    if (!fs.existsSync(targetFullPath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileContentString = fs.readFileSync(targetFullPath, "utf-8");
    return { content: fileContentString };
  }

  if (name === "write_project_file") {
    const projectName = String(toolArguments?.projectName);
    const filePath = String(toolArguments?.filePath);
    const fileContentString = String(toolArguments?.content);
    const targetFullPath = resolveSafePath(projectName, filePath);

    fs.mkdirSync(path.dirname(targetFullPath), { recursive: true });
    fs.writeFileSync(targetFullPath, fileContentString, "utf-8");

    return { message: `Successfully wrote ${filePath} in project ${projectName}` };
  }

  if (name === "compile_project") {
    const projectName = String(toolArguments?.projectName);
    const engineName = String(toolArguments?.engine || "xelatex");
    const entryFilename = String(toolArguments?.entryFile || "main.tex");
    const projectDirectoryPath = path.resolve(PROJECTS_DIR, projectName);

    if (!fs.existsSync(projectDirectoryPath)) {
      throw new Error(`Project directory not found: ${projectName}`);
    }

    const targetTexFile = resolveSafePath(projectName, entryFilename);
    const outputPdfPath = path.join(projectDirectoryPath, `${path.basename(entryFilename, ".tex")}.pdf`);

    let stdoutOutput = "";
    let stderrOutput = "";
    const commandString = `${engineName} -interaction=nonstopmode -output-directory=${projectDirectoryPath} ${targetTexFile}`;

    try {
      const executionResult = await execAsync(commandString);
      stdoutOutput = executionResult.stdout;
      stderrOutput = executionResult.stderr;
    } catch (executionError: any) {
      stdoutOutput = executionError.stdout || "";
      stderrOutput = executionError.stderr || executionError.message;
    }

    const isPdfGenerated = fs.existsSync(outputPdfPath);
    const pageCountNumber = await getPDFPageCount(outputPdfPath);
    const diagnosticsResult = parseTeXDiagnostics(stdoutOutput, stderrOutput);

    return {
      status: isPdfGenerated ? "compiled" : "failed",
      engine: engineName,
      pageCount: pageCountNumber,
      diagnostics: diagnosticsResult,
      outputLog: stdoutOutput.slice(-1500),
      errors: stderrOutput.slice(-1000),
      pdfPath: isPdfGenerated ? outputPdfPath : "",
    };
  }

  if (name === "get_project_pdf") {
    const projectName = String(toolArguments?.projectName);
    const pdfFilename = String(toolArguments?.pdfName || "main.pdf");
    const pdfFullPath = resolveSafePath(projectName, pdfFilename);

    if (!fs.existsSync(pdfFullPath)) {
      throw new Error(`PDF artifact not found: ${pdfFilename} in project ${projectName}`);
    }

    const pdfBuffer = fs.readFileSync(pdfFullPath);
    const base64DataString = pdfBuffer.toString("base64");
    const totalPages = await getPDFPageCount(pdfFullPath);

    return {
      fileName: pdfFilename,
      mimeType: "application/pdf",
      pageCount: totalPages,
      base64Data: base64DataString,
      sizeBytes: pdfBuffer.length,
    };
  }

  if (name === "get_project_preview_image") {
    const projectName = String(toolArguments?.projectName);
    const pdfFilename = String(toolArguments?.pdfName || "main.pdf");
    const targetPageNumber = parseInt(toolArguments?.pageNumber || "1", 10);
    const resolutionDPI = parseInt(toolArguments?.dpi || "150", 10);

    const pdfFullPath = resolveSafePath(projectName, pdfFilename);
    if (!fs.existsSync(pdfFullPath)) {
      throw new Error(`PDF artifact not found: ${pdfFilename} in project ${projectName}`);
    }

    const temporaryOutputPrefix = path.join(PROJECTS_DIR, projectName, `preview_p${targetPageNumber}`);
    const pdftoppmCommand = `pdftoppm -png -r ${resolutionDPI} -f ${targetPageNumber} -l ${targetPageNumber} "${pdfFullPath}" "${temporaryOutputPrefix}"`;

    await execAsync(pdftoppmCommand);

    const expectedPngPath = `${temporaryOutputPrefix}-${targetPageNumber}.png`;
    const fallbackPngPath = `${temporaryOutputPrefix}-01.png`;
    const finalPngPath = fs.existsSync(expectedPngPath) ? expectedPngPath : fallbackPngPath;

    if (!fs.existsSync(finalPngPath)) {
      throw new Error(`Failed generating PNG preview image for page ${targetPageNumber}`);
    }

    const imageBuffer = fs.readFileSync(finalPngPath);
    const imageBase64String = imageBuffer.toString("base64");

    fs.unlinkSync(finalPngPath);

    return {
      fileName: `${path.basename(pdfFilename, ".pdf")}_p${targetPageNumber}.png`,
      mimeType: "image/png",
      pageNumber: targetPageNumber,
      base64Data: imageBase64String,
      sizeBytes: imageBuffer.length,
    };
  }

  throw new Error(`Unknown MCP tool requested: ${name}`);
}

/**
 * Initializes and configures the Model Context Protocol Server with LaTeX management tools.
 */
function createMCPServer(): Server {
  const serverInstance = new Server(
    {
      name: "open-overleaf-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  serverInstance.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "list_projects",
          description: "Lists all LaTeX projects stored in open-overleaf.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "read_project_file",
          description: "Reads a .tex or text file from an open-overleaf project.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              filePath: { type: "string", description: "Relative file path inside project" },
            },
            required: ["projectName", "filePath"],
          },
        },
        {
          name: "write_project_file",
          description: "Writes or updates a .tex file in an open-overleaf project.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              filePath: { type: "string", description: "Relative file path inside project" },
              content: { type: "string", description: "Updated file content" },
            },
            required: ["projectName", "filePath", "content"],
          },
        },
        {
          name: "compile_project",
          description: "Triggers LaTeX compilation for an open-overleaf project and parses diagnostics/page counts.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              engine: { type: "string", description: "Compilation engine: xelatex, pdflatex, lualatex", default: "xelatex" },
              entryFile: { type: "string", description: "Target tex file to compile", default: "main.tex" },
            },
            required: ["projectName"],
          },
        },
        {
          name: "get_project_pdf",
          description: "Retrieves compiled PDF document as base64 encoded binary data.",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              pdfName: { type: "string", description: "PDF filename to retrieve", default: "main.pdf" },
            },
            required: ["projectName"],
          },
        },
        {
          name: "get_project_preview_image",
          description: "Converts a specified PDF page to PNG preview image (base64 string).",
          inputSchema: {
            type: "object",
            properties: {
              projectName: { type: "string", description: "Name of the LaTeX project" },
              pdfName: { type: "string", description: "PDF filename", default: "main.pdf" },
              pageNumber: { type: "integer", description: "Page number to render", default: 1 },
              dpi: { type: "integer", description: "Image resolution DPI", default: 150 },
            },
            required: ["projectName"],
          },
        },
      ],
    };
  });

  serverInstance.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: toolArguments } = request.params;
    try {
      const resultData = await executeMCPTool(name, toolArguments || {});
      return {
        content: [{ type: "text", text: JSON.stringify(resultData) }],
      };
    } catch (handlerError: any) {
      return {
        content: [{ type: "text", text: `Error executing tool ${name}: ${handlerError.message}` }],
        isError: true,
      };
    }
  });

  return serverInstance;
}

const activeSseTransportsMap = new Map<string, SSEServerTransport>();

/**
 * Handles HTTP Tool Execution requests and SSE endpoints.
 */
async function handleHttpRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  serverInstance: Server
): Promise<void> {
  const requestUrl = request.url || "/";

  if (MCP_TOKEN) {
    const authHeader = request.headers["authorization"] || "";
    const expectedHeader = `Bearer ${MCP_TOKEN}`;
    if (authHeader !== expectedHeader) {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Unauthorized MCP access" }));
      return;
    }
  }

  if (request.method === "GET" && requestUrl.startsWith("/sse")) {
    const sseTransport = new SSEServerTransport("/message", response);
    activeSseTransportsMap.set(sseTransport.sessionId, sseTransport);
    await serverInstance.connect(sseTransport);
    return;
  }

  if (request.method === "POST" && requestUrl.startsWith("/message")) {
    const urlObject = new URL(requestUrl, `http://${request.headers.host}`);
    const sessionId = urlObject.searchParams.get("sessionId");
    if (sessionId && activeSseTransportsMap.has(sessionId)) {
      const transportInstance = activeSseTransportsMap.get(sessionId)!;
      await transportInstance.handlePostMessage(request, response);
      return;
    }
  }

  if (request.method === "POST" && requestUrl === "/api/mcp/tool") {
    let requestBodyRaw = "";
    request.on("data", (chunk) => {
      requestBodyRaw += chunk;
    });

    request.on("end", async () => {
      try {
        const parsedBody = JSON.parse(requestBodyRaw);
        const requestedToolName = parsedBody.tool;
        const requestedToolArguments = parsedBody.arguments || {};

        const resultData = await executeMCPTool(requestedToolName, requestedToolArguments);

        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            success: true,
            result: resultData,
          })
        );
      } catch (postError: any) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ success: false, error: postError.message }));
      }
    });
    return;
  }

  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: "Endpoint not found" }));
}

/**
 * Main application entrypoint starting Stdio and HTTP MCP transports.
 */
async function startServer(): Promise<void> {
  const mcpServerInstance = createMCPServer();

  if (process.argv.includes("--stdio")) {
    const stdioTransport = new StdioServerTransport();
    await mcpServerInstance.connect(stdioTransport);
    return;
  }

  const httpServerInstance = http.createServer((request, response) => {
    handleHttpRequest(request, response, mcpServerInstance);
  });

  httpServerInstance.listen(MCP_PORT, () => {
    console.log(`Open-Overleaf MCP Server running on HTTP port ${MCP_PORT}`);
  });
}

startServer().catch((fatalError) => {
  console.error("Fatal MCP Server error:", fatalError);
  process.exit(1);
});
