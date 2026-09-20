import { NextRequest, NextResponse } from "next/server";
import { getEffectiveMCPToken } from "@/lib/mcp-auth";
import crypto from "crypto";

const INTERNAL_MCP_URL = `http://127.0.0.1:${process.env.MCP_PORT || "3202"}`;

export async function POST(req: NextRequest) {
  try {
    const authHeader = (req.headers.get("authorization") || "").trim();
    if (!authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Missing Bearer token in Authorization header" },
        { status: 401 }
      );
    }

    const cleanIncomingToken = authHeader.slice(7).trim();
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
