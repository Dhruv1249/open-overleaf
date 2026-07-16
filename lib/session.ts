import jwt from "jsonwebtoken";

export function verifySessionFromRequest(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.split(";").map(c => c.trim()).find(c => c.startsWith("oo_session="));
  if (!match) return null;
  const token = match.split("=")[1];
  try {
    const payload = jwt.verify(token, process.env.SESSION_SECRET || "dev-secret");
    return payload as any;
  } catch {
    return null;
  }
}
