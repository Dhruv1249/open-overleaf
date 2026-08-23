import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const INTERNAL_MCP_URL = `http://127.0.0.1:${process.env.MCP_PORT || "3202"}`;

function getEffectiveMCPToken(): string {
  if (process.env.OVERLEAF_MCP_TOKEN) {
    return process.env.OVERLEAF_MCP_TOKEN;
  }

  const secretString = process.env.OVERLEAF_MCP_SECRET || process.env.SESSION_SECRET;
  if (!secretString) {
    return "";
  }

  let ghTokenHash = process.env.GITHUB_TOKEN_HASH || "";
  if (!ghTokenHash) {
    const rawSecret = process.env.GITHUB_CLIENT_SECRET || "";
    if (rawSecret) {
      ghTokenHash = crypto.createHash("sha256").update(rawSecret).digest("hex");
    }
  }
  const repoName = process.env.GITHUB_SINGLE_REPO_NAME || "overleaf-projects";
  const rawCombined = `${secretString}:${ghTokenHash}:${repoName}`;
  return crypto.createHash("sha256").update(rawCombined).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = (req.headers.get("authorization") || "").trim();
    if (!authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Missing Bearer token in Authorization header" },
        { status: 401 }
      );
    }

    const cleanIncomingToken = incomingToken.trim();
    let isAuthorized = false;

    const activeMCPToken = getEffectiveMCPToken();
    if (activeMCPToken && cleanIncomingToken === activeMCPToken) {
      isAuthorized = true;
    }
    if (!isAuthorized && process.env.OVERLEAF_MCP_TOKEN) {
      isAuthorized = cleanIncomingToken === process.env.OVERLEAF_MCP_TOKEN.trim();
    }
    if (!isAuthorized && process.env.OVERLEAF_MCP_SECRET) {
      isAuthorized = cleanIncomingToken === process.env.OVERLEAF_MCP_SECRET.trim();
    }
    if (!isAuthorized && process.env.SESSION_SECRET) {
      isAuthorized = cleanIncomingToken === process.env.SESSION_SECRET.trim();
    }
    if (!isAuthorized && process.env.OVERLEAF_MCP_SECRET) {
      const hashedSecret = crypto.createHash("sha256").update(process.env.OVERLEAF_MCP_SECRET.trim()).digest("hex");
      isAuthorized = cleanIncomingToken === hashedSecret;
    }
    if (!isAuthorized && process.env.SESSION_SECRET) {
      const hashedSecret = crypto.createHash("sha256").update(process.env.SESSION_SECRET.trim()).digest("hex");
      isAuthorized = cleanIncomingToken === hashedSecret;
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: "Unauthorized MCP access: invalid token" },
        { status: 401 }
      );
    }

    const requestBody = await req.json();

    const mcpResponse = await fetch(`${INTERNAL_MCP_URL}/api/mcp/tool`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await mcpResponse.json().catch(() => ({}));
    return NextResponse.json(data, { status: mcpResponse.status });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `MCP Proxy Error: ${err.message || err}` },
      { status: 500 }
    );
  }
}
