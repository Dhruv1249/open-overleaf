/**
 * Unit test suite verifying MCP Server transports and authentication.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
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

