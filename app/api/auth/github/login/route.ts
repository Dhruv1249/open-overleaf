import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const state = Math.random().toString(36).slice(2);
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID || "",
    redirect_uri: `${origin}/api/auth/github/callback`,
    scope: "repo read:user",
    state,
    allow_signup: "false",
  });

  const githubAuth = `https://github.com/login/oauth/authorize?${params.toString()}`;
  return NextResponse.redirect(githubAuth);
}
