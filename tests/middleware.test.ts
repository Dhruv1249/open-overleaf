/**
 * Test suite verifying Next.js edge routing middleware security and authentication bypasses.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";
import { middleware } from "../middleware.ts";

describe("Open-Overleaf Edge Middleware Authentication", () => {
  const originalSessionSecret = process.env.SESSION_SECRET;
  const originalMcpToken = process.env.OVERLEAF_MCP_TOKEN;
  const originalMcpSecret = process.env.OVERLEAF_MCP_SECRET;
  const testSessionSecret = "test-secret-key-32-bytes-long-1234";
  const testMcpToken = "test-mcp-token-value";

  beforeEach(() => {
    process.env.SESSION_SECRET = testSessionSecret;
    process.env.OVERLEAF_MCP_TOKEN = testMcpToken;
  });

  afterEach(() => {
    process.env.SESSION_SECRET = originalSessionSecret;
    process.env.OVERLEAF_MCP_TOKEN = originalMcpToken;
    process.env.OVERLEAF_MCP_SECRET = originalMcpSecret;
  });

  test("rejects unauthenticated API requests with 401 Unauthorized", async () => {
    const request = new NextRequest("http://localhost:3000/api/projects/sample/compile", {
      method: "POST",
    });
    const response = await middleware(request);
    assert.strictEqual(response.status, 401);
  });

  test("allows API requests with valid Bearer token matching OVERLEAF_MCP_TOKEN", async () => {
    const request = new NextRequest("http://localhost:3000/api/projects/sample/compile", {
      method: "POST",
      headers: {
        authorization: `Bearer ${testMcpToken}`,
      },
    });
    const response = await middleware(request);
    assert.strictEqual(response.status, 200);
  });

  test("rejects requests with only x-internal-mcp header and no Bearer token with 401", async () => {
    const request = new NextRequest("http://localhost:3000/api/projects/sample/compile", {
      method: "POST",
      headers: {
        "x-internal-mcp": "true",
        "x-internal-token": testMcpToken,
      },
    });
    const response = await middleware(request);
    assert.strictEqual(response.status, 401);
  });

  test("allows requests to /api/mcp routes without requiring browser session", async () => {
    const request = new NextRequest("http://localhost:3000/api/mcp/tool", {
      method: "POST",
    });
    const response = await middleware(request);
    assert.strictEqual(response.status, 200);
  });

  test("allows requests to /login page without authentication", async () => {
    const request = new NextRequest("http://localhost:3000/login", {
      method: "GET",
    });
    const response = await middleware(request);
    assert.strictEqual(response.status, 200);
  });
});
