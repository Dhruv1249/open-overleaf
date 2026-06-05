import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export async function GET(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.split(";").map(c => c.trim()).find(c => c.startsWith("oo_session="));
  if (!match) return NextResponse.json({ authenticated: false });
  const token = match.split("=")[1];
  try {
    const payload = jwt.verify(token, process.env.SESSION_SECRET || "dev-secret");
    // Never expose the raw access token to the client
    if (typeof payload === "object" && payload !== null && "access_token" in payload) {
      // create a shallow copy without access_token
      // @ts-ignore
      const { access_token, ...rest } = payload;
      return NextResponse.json({ authenticated: true, user: rest });
    }
    return NextResponse.json({ authenticated: true, user: payload });
  } catch (e) {
    return NextResponse.json({ authenticated: false });
  }
}
