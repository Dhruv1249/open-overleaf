import { NextResponse } from "next/server";
import { isConnected, clearTokens } from "@/lib/google-drive";

// GET /api/auth/google/status  →  { connected: boolean }
export async function GET() {
  return NextResponse.json({ connected: isConnected() });
}

// DELETE /api/auth/google/status  →  disconnect (remove tokens)
export async function DELETE() {
  clearTokens();
  return NextResponse.json({ ok: true });
}
