import { NextResponse } from "next/server.js";
import type { NextRequest } from "next/server.js";

/**
 * Verifies HMAC SHA-256 JWT signature and expiration using the Web Crypto API.
 */
async function verifySessionJwt(token: string, secret: string): Promise<boolean> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    const [headerB64, payloadB64, signatureB64] = parts;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const base64UrlToBytes = (base64Url: string) => {
      let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4) base64 += "=";
      const raw = atob(base64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      return bytes;
    };

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signatureB64),
      encoder.encode(`${headerB64}.${payloadB64}`)
    );
    if (!isValid) return false;

    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && Date.now() >= payload.exp * 1000) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Edge middleware with two auth paths:
 *   1. Browser session — oo_session cookie verified as HMAC-SHA256 JWT.
 *   2. MCP / internal — Bearer token matched against OVERLEAF_MCP_TOKEN.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.includes(".") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const sessionSecret = process.env.SESSION_SECRET ?? "";
  const mcpToken = (process.env.OVERLEAF_MCP_TOKEN ?? "").trim();

  let authenticated = false;

  const sessionCookie = request.cookies.get("oo_session")?.value;
  if (sessionCookie && sessionSecret) {
    authenticated = await verifySessionJwt(sessionCookie, sessionSecret);
  }

  if (!authenticated && mcpToken) {
    const authHeader = (request.headers.get("authorization") ?? "").trim();
    if (authHeader.startsWith("Bearer ")) {
      authenticated = authHeader.slice(7).trim() === mcpToken;
    }
  }

  const isPublicRoute =
    pathname === "/login" ||
    pathname === "/api/auth/github/login" ||
    pathname === "/api/auth/github/callback" ||
    pathname === "/api/auth/session" ||
    pathname === "/api/auth/logout" ||
    pathname.startsWith("/api/mcp");

  if (!authenticated) {
    if (isPublicRoute) return NextResponse.next();

    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const loginUrl = new URL("/login", request.url);
    const err = request.nextUrl.searchParams.get("error");
    if (err) loginUrl.searchParams.set("error", err);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
