import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as http from "http";
import * as path from "path";
import * as crypto from "crypto";
import { fileURLToPath } from "url";
import { ensureRepoCloned } from "./lib/mcp/git.ts";
import { allToolDefinitions, executeTool } from "./lib/mcp/registry.ts";
import { promptDefinitions, handleGetPrompt } from "./lib/mcp/prompts.ts";

const MCP_PORT = parseInt(process.env.MCP_PORT || "3202", 10);

/**
 * Executes a tool by delegating to the modularized MCP registry.
 */
export async function executeMCPTool(name: string, toolArguments: Record<string, any>): Promise<any> {
  return await executeTool(name, toolArguments || {});
}

/**
 * Instantiates and configures the MCP Server instance with tools and prompts.
 */
export function createMCPServer(): Server {
  const serverInstance = new Server(
    { name: "open-overleaf-mcp-server", version: "2.1.0" },
    {
      capabilities: {
        tools: {},
        prompts: {},
      },
    }
  );

  serverInstance.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: allToolDefinitions,
    };
  });

  serverInstance.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: promptDefinitions,
    };
  });

  serverInstance.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: promptArgs } = request.params;
    return handleGetPrompt(name, promptArgs);
  });

  serverInstance.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: toolArguments } = request.params;
    try {
      const resultData = await executeMCPTool(name, toolArguments || {});
      return { content: [{ type: "text", text: JSON.stringify(resultData) }] };
    } catch (handlerError: any) {
      return {
        content: [{ type: "text", text: `Error executing tool ${name}: ${handlerError.message}` }],
        isError: true,
      };
    }
  });

  return serverInstance;
}

function getEffectiveMCPToken(): string {
  if (process.env.OVERLEAF_MCP_TOKEN) {
    return process.env.OVERLEAF_MCP_TOKEN;
  }
  const secretString = process.env.OVERLEAF_MCP_SECRET || process.env.SESSION_SECRET;
  if (!secretString) {
    throw new Error("Neither OVERLEAF_MCP_TOKEN nor SESSION_SECRET is configured");
  }
  const ghClientSecret = process.env.GITHUB_CLIENT_SECRET || "";
  const ghHash = ghClientSecret
    ? crypto.createHash("sha256").update(ghClientSecret).digest("hex")
    : "";
  const repoName = process.env.GITHUB_SINGLE_REPO_NAME || "overleaf-projects";
  return crypto.createHash("sha256").update(`${secretString}:${ghHash}:${repoName}`).digest("hex");
}

const activeSseTransportsMap = new Map<string, SSEServerTransport>();
const activeStreamableTransportsMap = new Map<string, StreamableHTTPServerTransport>();

/**
 * Handles incoming HTTP requests for REST tool execution, SSE, and Streamable HTTP transports.
 */
export async function handleHttpRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse
): Promise<void> {
  const requestUrl = request.url || "/";
  const parsedUrl = new URL(requestUrl, `http://${request.headers.host || "localhost"}`);
  const normalizedPathname = parsedUrl.pathname;

  try {
    const authorizationHeader = (request.headers["authorization"] || "").trim();
    if (!authorizationHeader.startsWith("Bearer ")) {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Unauthorized: Missing Bearer token" }));
      return;
    }
    const incomingToken = authorizationHeader.slice(7).trim();
    let isAuthorized = false;

    try {
      isAuthorized = incomingToken === getEffectiveMCPToken();
    } catch { }

    if (!isAuthorized && process.env.OVERLEAF_MCP_TOKEN) {
      isAuthorized = incomingToken === process.env.OVERLEAF_MCP_TOKEN.trim();
    }
    if (!isAuthorized && process.env.SESSION_SECRET) {
      isAuthorized = incomingToken === process.env.SESSION_SECRET.trim();
    }
    if (!isAuthorized && process.env.OVERLEAF_MCP_SECRET) {
      isAuthorized = incomingToken === crypto.createHash("sha256").update(process.env.OVERLEAF_MCP_SECRET.trim()).digest("hex");
    }
    if (!isAuthorized && process.env.SESSION_SECRET) {
      isAuthorized = incomingToken === crypto.createHash("sha256").update(process.env.SESSION_SECRET.trim()).digest("hex");
    }

    if (!isAuthorized) {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Unauthorized MCP access: invalid token" }));
      return;
    }
  } catch (authError: any) {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: authError.message || "MCP authentication error" }));
    return;
  }

  if (request.method === "POST" && normalizedPathname === "/api/mcp/tool") {
    let requestBodyRaw = "";
    request.on("data", (chunk) => { requestBodyRaw += chunk; });
    request.on("end", async () => {
      try {
        const parsedBody = JSON.parse(requestBodyRaw);
        const resultData = await executeMCPTool(parsedBody.tool, parsedBody.arguments || {});
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ success: true, result: resultData }));
      } catch (postError: any) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ success: false, error: postError.message }));
      }
    });
    return;
  }

  if (request.method === "POST" && normalizedPathname.startsWith("/message")) {
    const sessionId = parsedUrl.searchParams.get("sessionId");
    if (sessionId && activeSseTransportsMap.has(sessionId)) {
      await activeSseTransportsMap.get(sessionId)!.handlePostMessage(request, response);
      return;
    }
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Session not found" }));
    return;
  }

  const isMcpEndpoint =
    normalizedPathname === "/sse" ||
    normalizedPathname === "/mcp" ||
    normalizedPathname === "/";

  if (isMcpEndpoint) {
    const incomingSessionId = (request.headers["mcp-session-id"] as string | undefined)?.trim();

    if (incomingSessionId) {
      const existingTransport = activeStreamableTransportsMap.get(incomingSessionId);
      if (!existingTransport) {
        response.writeHead(404, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Session not found" }, id: null }));
        return;
      }
      await existingTransport.handleRequest(request, response);
      return;
    }

    if (request.method === "GET" && (request.headers["accept"] || "").includes("text/event-stream")) {
      const sseTransport = new SSEServerTransport("/message", response);
      activeSseTransportsMap.set(sseTransport.sessionId, sseTransport);
      sseTransport.onclose = () => { activeSseTransportsMap.delete(sseTransport.sessionId); };
      const sessionServerInstance = createMCPServer();
      await sessionServerInstance.connect(sseTransport);
      return;
    }

    if (request.method === "POST") {
      const streamableTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (newSessionId: string) => {
          activeStreamableTransportsMap.set(newSessionId, streamableTransport);
        },
      });
      streamableTransport.onclose = () => {
        if (streamableTransport.sessionId) {
          activeStreamableTransportsMap.delete(streamableTransport.sessionId);
        }
      };
      const sessionServerInstance = createMCPServer();
      await sessionServerInstance.connect(streamableTransport);
      await streamableTransport.handleRequest(request, response);
      return;
    }

    if (request.method === "GET") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "healthy", service: "open-overleaf-mcp" }));
      return;
    }
  }

  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: "Endpoint not found" }));
}

/**
 * Main application entrypoint — ensures the repo is cloned before starting Stdio or HTTP transports.
 */
async function startServer(): Promise<void> {
  await ensureRepoCloned();

  if (process.argv.includes("--stdio")) {
    const stdioServerInstance = createMCPServer();
    const stdioTransport = new StdioServerTransport();
    await stdioServerInstance.connect(stdioTransport);
    return;
  }

  const httpServerInstance = http.createServer((request, response) => {
    handleHttpRequest(request, response);
  });

  httpServerInstance.listen(MCP_PORT, () => {
    console.log(`Open-Overleaf MCP Server running on HTTP port ${MCP_PORT}`);
  });
}

const currentFilePath = fileURLToPath(import.meta.url);
const executionArgument = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isDirectExecution =
  executionArgument === currentFilePath ||
  executionArgument.endsWith("mcp-server.ts") ||
  executionArgument.endsWith("mcp-server.js");

if (isDirectExecution) {
  startServer().catch((fatalError) => {
    console.error("Fatal MCP Server error:", fatalError);
    process.exit(1);
  });
}
