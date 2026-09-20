/**
 * Unit test suite verifying MCP Server transports and authentication.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { handleHttpRequest } from "../mcp-server.ts";

describe("Open-Overleaf MCP Server Transports & Authentication", () => {
  const testPortNumber = 48291;
  const testAuthenticationToken = "unit-test-secure-token-12345";
  let activeHttpServer: http.Server;

  before(async () => {
    process.env.OVERLEAF_MCP_TOKEN = testAuthenticationToken;

    activeHttpServer = http.createServer((incomingRequest, outgoingResponse) => {
      handleHttpRequest(incomingRequest, outgoingResponse);
    });

    await new Promise<void>((resolvePromise) => {
      activeHttpServer.listen(testPortNumber, () => resolvePromise());
    });
  });

  after(async () => {
    await new Promise<void>((resolvePromise) => {
      activeHttpServer.close(() => resolvePromise());
    });
  });

  test("rejects requests missing Bearer authorization token with 401", async () => {
    const responsePayload = await fetch(`http://localhost:${testPortNumber}/sse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });

    assert.strictEqual(responsePayload.status, 401);
    const parsedBody = await responsePayload.json();
    assert.match(parsedBody.error, /Unauthorized/);
  });

  test("rejects requests with invalid authorization token with 401", async () => {
    const responsePayload = await fetch(`http://localhost:${testPortNumber}/sse`, {
      method: "POST",
      headers: {
        Authorization: "Bearer invalid-token-value",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });

    assert.strictEqual(responsePayload.status, 401);
  });

  test("returns 404 for non-existent session ID header", async () => {
    const responsePayload = await fetch(`http://localhost:${testPortNumber}/sse`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
        "mcp-session-id": "00000000-0000-0000-0000-000000000000",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });

    assert.strictEqual(responsePayload.status, 404);
    const parsedBody = await responsePayload.json();
    assert.strictEqual(parsedBody.error.code, -32001);
  });

  test("supports modern Streamable HTTP client connection and tool listing", async () => {
    const streamableClientTransport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${testPortNumber}/sse`),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${testAuthenticationToken}`,
          },
        },
      }
    );

    const activeMcpClient = new Client({
      name: "streamable-test-client",
      version: "1.0.0",
    });

    await activeMcpClient.connect(streamableClientTransport);
    const retrievedToolsResult = await activeMcpClient.listTools();

    assert.ok(Array.isArray(retrievedToolsResult.tools));
    assert.ok(retrievedToolsResult.tools.length > 0);

    const toolNameSet = new Set(retrievedToolsResult.tools.map((singleTool) => singleTool.name));
    assert.ok(toolNameSet.has("list_projects"));
    assert.ok(toolNameSet.has("read_project_file"));
    assert.ok(toolNameSet.has("write_project_file"));
    assert.ok(toolNameSet.has("compile_project"));
    assert.ok(toolNameSet.has("get_project_pdf"));

    await activeMcpClient.close();
  });

  test("supports legacy SSE client transport connection and tool listing", async () => {
    const legacySseClientTransport = new SSEClientTransport(
      new URL(`http://localhost:${testPortNumber}/sse`),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${testAuthenticationToken}`,
          },
        },
      }
    );

    const legacyMcpClient = new Client({
      name: "legacy-sse-test-client",
      version: "1.0.0",
    });

    await legacyMcpClient.connect(legacySseClientTransport);
    const retrievedToolsResult = await legacyMcpClient.listTools();

    assert.ok(Array.isArray(retrievedToolsResult.tools));
    const toolNameSet = new Set(retrievedToolsResult.tools.map((singleTool) => singleTool.name));
    assert.ok(toolNameSet.has("list_projects"));

    await legacyMcpClient.close();
  });

  test("supports direct REST tool execution endpoint used by Job-cruiser backend", async () => {
    const restToolResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "unknown_test_tool",
        arguments: {},
      }),
    });

    assert.strictEqual(restToolResponse.status, 400);
    const parsedResponseBody = await restToolResponse.json();
    assert.strictEqual(parsedResponseBody.success, false);
    assert.match(parsedResponseBody.error, /Unknown.*tool/i);
  });

  test("responds with health status on plain HTTP GET request", async () => {
    const healthCheckResponse = await fetch(`http://localhost:${testPortNumber}/sse`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        Accept: "application/json",
      },
    });

    assert.strictEqual(healthCheckResponse.status, 200);
    const parsedHealthCheck = await healthCheckResponse.json();
    assert.strictEqual(parsedHealthCheck.status, "healthy");
    assert.strictEqual(parsedHealthCheck.service, "open-overleaf-mcp");
  });

  test("supports Streamable HTTP communication on /mcp alternative endpoint", async () => {
    const streamableClientTransport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${testPortNumber}/mcp`),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${testAuthenticationToken}`,
          },
        },
      }
    );

    const clientInstance = new Client({
      name: "mcp-endpoint-client",
      version: "1.0.0",
    });

    await clientInstance.connect(streamableClientTransport);
    const toolsResult = await clientInstance.listTools();
    assert.ok(toolsResult.tools.length > 0);
    await clientInstance.close();
  });

  test("isolates multiple concurrent Streamable HTTP client sessions simultaneously", async () => {
    const firstClientTransport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${testPortNumber}/sse`),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${testAuthenticationToken}`,
          },
        },
      }
    );

    const secondClientTransport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${testPortNumber}/sse`),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${testAuthenticationToken}`,
          },
        },
      }
    );

    const firstClient = new Client({ name: "client-one", version: "1.0.0" });
    const secondClient = new Client({ name: "client-two", version: "1.0.0" });

    await Promise.all([
      firstClient.connect(firstClientTransport),
      secondClient.connect(secondClientTransport),
    ]);

    const [firstTools, secondTools] = await Promise.all([
      firstClient.listTools(),
      secondClient.listTools(),
    ]);

    assert.ok(firstTools.tools.length > 0);
    assert.ok(secondTools.tools.length > 0);
    assert.strictEqual(firstTools.tools.length, secondTools.tools.length);

    await Promise.all([firstClient.close(), secondClient.close()]);
  });
});

describe("Open-Overleaf MCP Tool Operations Without Remote GitHub Token", () => {
  const testPortNumber = 48292;
  const testAuthenticationToken = "unit-test-secure-token-67890";
  const temporaryTestProjectsDirectory = path.join(os.tmpdir(), `open-overleaf-unit-tests-${Date.now()}`);
  let activeHttpServer: http.Server;

  before(async () => {
    process.env.OVERLEAF_MCP_TOKEN = testAuthenticationToken;
    process.env.PROJECTS_DIR = temporaryTestProjectsDirectory;
    fs.mkdirSync(temporaryTestProjectsDirectory, { recursive: true });
    const { execSync } = await import("node:child_process");
    execSync("git init -b main", { cwd: temporaryTestProjectsDirectory });
    execSync("git config user.name 'Test User'", { cwd: temporaryTestProjectsDirectory });
    execSync("git config user.email 'test@example.com'", { cwd: temporaryTestProjectsDirectory });

    activeHttpServer = http.createServer((incomingRequest, outgoingResponse) => {
      handleHttpRequest(incomingRequest, outgoingResponse);
    });

    await new Promise<void>((resolvePromise) => {
      activeHttpServer.listen(testPortNumber, () => resolvePromise());
    });
  });

  after(async () => {
    await new Promise<void>((resolvePromise) => {
      activeHttpServer.close(() => resolvePromise());
    });
    try {
      fs.rmSync(temporaryTestProjectsDirectory, { recursive: true, force: true });
    } catch {
    }
  });

  test("create_file creates file on disk without requiring githubToken", async () => {
    const responsePayload = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "create_file",
        arguments: {
          projectName: "test-proj",
          filePath: "docs/intro.tex",
          content: "\\section{Introduction}",
        },
      }),
    });

    assert.strictEqual(responsePayload.status, 200);
    const parsed = await responsePayload.json();
    assert.strictEqual(parsed.success, true);

    const writtenFileOnDisk = path.join(temporaryTestProjectsDirectory, "test-proj", "docs", "intro.tex");
    assert.ok(fs.existsSync(writtenFileOnDisk));
    assert.strictEqual(fs.readFileSync(writtenFileOnDisk, "utf-8"), "\\section{Introduction}");
  });

  test("write_project_file updates file on disk and in compile directory", async () => {
    const responsePayload = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "write_project_file",
        arguments: {
          projectName: "test-proj",
          filePath: "main.tex",
          content: "\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}",
        },
      }),
    });

    assert.strictEqual(responsePayload.status, 200);
    const parsed = await responsePayload.json();
    assert.strictEqual(parsed.success, true);

    const writtenFileOnDisk = path.join(temporaryTestProjectsDirectory, "test-proj", "main.tex");
    assert.ok(fs.existsSync(writtenFileOnDisk));
  });

  test("rename_file renames file on disk without requiring githubToken", async () => {
    const responsePayload = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "rename_file",
        arguments: {
          projectName: "test-proj",
          fromPath: "docs/intro.tex",
          toPath: "docs/overview.tex",
        },
      }),
    });

    assert.strictEqual(responsePayload.status, 200);
    const parsed = await responsePayload.json();
    assert.strictEqual(parsed.success, true);

    const oldFilePath = path.join(temporaryTestProjectsDirectory, "test-proj", "docs", "intro.tex");
    const newFilePath = path.join(temporaryTestProjectsDirectory, "test-proj", "docs", "overview.tex");
    assert.ok(!fs.existsSync(oldFilePath));
    assert.ok(fs.existsSync(newFilePath));
  });

  test("search_in_project searches local files without git clone dependency", async () => {
    const responsePayload = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "search_in_project",
        arguments: {
          projectName: "test-proj",
          query: "Hello World",
        },
      }),
    });

    assert.strictEqual(responsePayload.status, 200);
    const parsed = await responsePayload.json();
    assert.strictEqual(parsed.success, true);
    assert.ok(parsed.result.totalMatches > 0);
    assert.strictEqual(parsed.result.matches[0].file, "main.tex");
  });

  test("validate_tex inspects local file without git clone dependency", async () => {
    const responsePayload = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "validate_tex",
        arguments: {
          projectName: "test-proj",
          filePath: "main.tex",
        },
      }),
    });

    assert.strictEqual(responsePayload.status, 200);
    const parsed = await responsePayload.json();
    assert.strictEqual(parsed.success, true);
    assert.ok("available" in parsed.result);
  });

  test("apply_patch applies edits locally without requiring githubToken", async () => {
    const responsePayload = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "apply_patch",
        arguments: {
          projectName: "test-proj",
          filePath: "main.tex",
          patches: [
            {
              startLine: 3,
              endLine: 3,
              originalContent: "Hello World",
              newContent: "Hello Patched World",
            },
          ],
        },
      }),
    });

    assert.strictEqual(responsePayload.status, 200);
    const parsed = await responsePayload.json();
    assert.strictEqual(parsed.success, true);

    const patchedFile = path.join(temporaryTestProjectsDirectory, "test-proj", "main.tex");
    const updatedContent = fs.readFileSync(patchedFile, "utf-8");
    assert.ok(updatedContent.includes("Hello Patched World"));
  });

  test("update_project_settings and get_project_settings manage settings locally", async () => {
    const updateResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "update_project_settings",
        arguments: {
          projectName: "test-proj",
          settings: {
            compiler: "xelatex",
            mainFile: "main.tex",
          },
        },
      }),
    });

    assert.strictEqual(updateResponse.status, 200);
    const parsedUpdate = await updateResponse.json();
    assert.strictEqual(parsedUpdate.success, true);

    const getResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "get_project_settings",
        arguments: {
          projectName: "test-proj",
        },
      }),
    });

    assert.strictEqual(getResponse.status, 200);
    const parsedGet = await getResponse.json();
    assert.strictEqual(parsedGet.success, true);
    assert.strictEqual(parsedGet.result.settings.compiler, "xelatex");
  });

  test("get_file_history and get_file_at_revision handle local-only projects gracefully", async () => {
    const historyResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "get_file_history",
        arguments: {
          projectName: "test-proj",
          filePath: "main.tex",
        },
      }),
    });

    assert.strictEqual(historyResponse.status, 200);
    const parsedHistory = await historyResponse.json();
    assert.strictEqual(parsedHistory.success, true);
    assert.ok(Array.isArray(parsedHistory.result.commits));

    const targetSha = parsedHistory.result.commits[0]?.sha || "HEAD";
    const revisionResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "get_file_at_revision",
        arguments: {
          projectName: "test-proj",
          filePath: "main.tex",
          sha: targetSha,
        },
      }),
    });

    assert.strictEqual(revisionResponse.status, 200);
    const parsedRevision = await revisionResponse.json();
    assert.strictEqual(parsedRevision.success, true);
    assert.ok(parsedRevision.result.content.includes("Hello Patched World"));
  });

  test("delete_file removes file from local disk", async () => {
    const deleteResponse = await fetch(`http://localhost:${testPortNumber}/api/mcp/tool`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testAuthenticationToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "delete_file",
        arguments: {
          projectName: "test-proj",
          filePath: "docs/overview.tex",
        },
      }),
    });

    assert.strictEqual(deleteResponse.status, 200);
    const parsedDelete = await deleteResponse.json();
    assert.strictEqual(parsedDelete.success, true);

    const deletedFilePath = path.join(temporaryTestProjectsDirectory, "test-proj", "docs", "overview.tex");
    assert.ok(!fs.existsSync(deletedFilePath));
  });
});

