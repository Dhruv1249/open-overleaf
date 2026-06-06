import { NextRequest, NextResponse } from "next/server";
import { writeTokens } from "@/lib/google-drive";

// GET /api/auth/google/callback  ← Google redirects here with ?code=...
export async function GET(req: NextRequest) {
  const url    = new URL(req.url);
  const origin = url.origin;
  const code   = url.searchParams.get("code");
  const error  = url.searchParams.get("error");

  if (error || !code) {
    // Close popup with error signal
    return htmlClose(origin, "error");
  }

  const redirectUri    = `${origin}/api/auth/google/callback`;
  const clientId       = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret   = process.env.GOOGLE_CLIENT_SECRET!;

  // Exchange code for tokens
  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      grant_type:    "authorization_code",
    }),
  });

  if (!tokenResp.ok) {
    return htmlClose(origin, "error");
  }

  const data = await tokenResp.json();
  if (!data.access_token || !data.refresh_token) {
    return htmlClose(origin, "error");
  }

  writeTokens({
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at:    Date.now() + (data.expires_in ?? 3600) * 1000,
  });

  return htmlClose(origin, "success");
}

// Renders a tiny page that posts a message to the opener and closes itself
function htmlClose(origin: string, status: "success" | "error") {
  const html = `<!DOCTYPE html>
<html>
<head><title>Google Drive</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0d1117;color:#e6edf3">
  <div style="text-align:center">
    ${status === "success"
      ? `<p style="color:#3fb950;font-size:1.1rem">✓ Connected to Google Drive</p>`
      : `<p style="color:#f85149;font-size:1.1rem">✗ Authorization failed</p>`}
    <p style="color:#8b949e;font-size:0.875rem">This window will close automatically…</p>
  </div>
  <script>
    window.opener && window.opener.postMessage(
      { type: "google-auth", status: "${status}" },
      ${JSON.stringify(origin)}
    );
    setTimeout(() => window.close(), 1200);
  </script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}
