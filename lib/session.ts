import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export function verifySessionFromRequest(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const sessionCookie = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("oo_session="));
  if (!sessionCookie) throw new AuthenticationError("No session cookie present");
  const token = sessionCookie.split("=")[1];
  if (!token) throw new AuthenticationError("Empty session token");
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret)
    throw new AuthenticationError("SESSION_SECRET not configured");
  const payload = jwt.verify(token, sessionSecret);
  return payload as any;
}

export function requireSession(
  req: Request
): { session: any } | { error: NextResponse } {
  try {
    const session = verifySessionFromRequest(req);
    return { session };
  } catch {
    return {
      error: NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }
}
