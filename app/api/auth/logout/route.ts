import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ loggedOut: true });
  res.cookies.set({ name: "oo_session", value: "", maxAge: 0, path: "/" });
  return res;
}
