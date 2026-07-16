import { NextRequest, NextResponse } from "next/server";

// GET /api/auth/google  →  redirect user to Google OAuth consent screen
export async function GET(req: NextRequest) {
  const origin       = process.env.APP_URL || new URL(req.url).origin;
  const redirectUri  = `${origin}/api/auth/google/callback`;
  const clientId     = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json({ error: "GOOGLE_CLIENT_ID not configured" }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         "https://www.googleapis.com/auth/drive.file",
    access_type:   "offline",
    prompt:        "consent",     // always prompt so we always get a refresh_token
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
