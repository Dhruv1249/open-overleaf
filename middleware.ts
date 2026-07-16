import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Verify HMAC SHA-256 JWT signature using standard Web Crypto API (supported in Edge Runtime)
async function verifyJwt(token: string, secret: string): Promise<any | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    
    // Verify signature
    const encoder = new TextEncoder();
    const secretKeyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey(
      "raw",
      secretKeyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const base64UrlToBytes = (base64Url: string) => {
      let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4) {
        base64 += "=";
      }
      const raw = atob(base64);
      const val = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        val[i] = raw.charCodeAt(i);
      }
      return val;
    };

    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const signature = base64UrlToBytes(signatureB64);

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      data
    );

    if (!isValid) return null;

    // Decode payload
    const payloadJson = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson);

    // Check expiration
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Skip next static files, public files, and favicon
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.includes(".") || // e.g. favicon.ico, images, etc.
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // 2. Retrieve session cookie
  const sessionCookie = request.cookies.get("oo_session")?.value;
  const secret = process.env.SESSION_SECRET || "dev-secret";

  let hasValidSession = false;
  if (sessionCookie) {
    const payload = await verifyJwt(sessionCookie, secret);
    if (payload) {
      hasValidSession = true;
    }
  }

  // 3. Define bypass paths for OAuth / Authentication endpoints
  const isAuthApi =
    pathname === "/api/auth/github/login" ||
    pathname === "/api/auth/github/callback" ||
    pathname === "/api/auth/session" ||
    pathname === "/api/auth/logout";

  // 4. Handle Redirection / Gatekeeping
  if (!hasValidSession) {
    // ALLOW access to login page and authentication APIs even if not authenticated
    if (pathname === "/login" || isAuthApi) {
      return NextResponse.next();
    }

    // Block all other API requests with a 401 response
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    // Redirect any page request to the login screen
    const loginUrl = new URL("/login", request.url);
    // Preserve any existing error parameters (like forbidden/oauth)
    const err = request.nextUrl.searchParams.get("error");
    if (err) {
      loginUrl.searchParams.set("error", err);
    }
    return NextResponse.redirect(loginUrl);
  } else {
    // If the user HAS a valid session and tries to visit `/login`, redirect to `/`
    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }
}

// Apply middleware to all routes except internal Next.js assets
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/production-check (if any)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
