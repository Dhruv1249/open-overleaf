import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

async function exchangeCode(code: string, redirectUri: string) {
  const resp = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  return resp.json();
}

async function fetchGitHubUser(token: string) {
  const resp = await fetch("https://api.github.com/user", {
    headers: { Authorization: `token ${token}`, Accept: "application/vnd.github+json" },
  });
  return resp.json();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;
  if (!code) return NextResponse.redirect(new URL("/login", origin));

  const tokenResp = await exchangeCode(code, `${origin}/api/auth/github/callback`);
  const accessToken = tokenResp.access_token;
  if (!accessToken) return NextResponse.redirect(new URL("/login?error=oauth", origin));

  const user = await fetchGitHubUser(accessToken);
  const allowed = process.env.ALLOW_GITHUB_USERNAME;
  if (!user || !user.login || (allowed && user.login !== allowed)) {
    return NextResponse.redirect(new URL("/login?error=forbidden", origin));
  }

  const payload = { id: user.id, login: user.login, name: user.name, access_token: accessToken };
  const secret = process.env.SESSION_SECRET || "dev-secret";
  const token = jwt.sign(payload, secret, { expiresIn: "7d" });

  const res = NextResponse.redirect(new URL("/", origin));
  res.cookies.set({
    name: "oo_session",
    value: token,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}
