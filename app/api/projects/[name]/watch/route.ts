import { NextRequest, NextResponse } from "next/server";
import { resolveSafeProjectPath } from "@/lib/git";
import { requireSession } from "@/lib/session";
import fs from "fs";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  const authResult = requireSession(req as unknown as Request);
  if ("error" in authResult) return authResult.error;

  const { name: project } = await ctx.params;
  let projectDir: string;
  try {
    projectDir = resolveSafeProjectPath(project, "");
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }

  if (!fs.existsSync(projectDir)) {
    return NextResponse.json({ ok: false, error: "Project directory not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let watcher: fs.FSWatcher | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;
  const changedFiles = new Set<string>();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`event: ready\ndata: ${JSON.stringify({ project, ready: true })}\n\n`)
      );

      // Keepalive ping every 20 seconds
      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 20000);

      // Ignore noise, git internals, and temporary compile artifacts
      const shouldIgnore = (filename: string | null) => {
        if (!filename) return false;
        const normalized = filename.replace(/\\/g, "/");
        if (
          normalized.startsWith(".git") ||
          normalized.startsWith(".next") ||
          normalized.includes("/.git/") ||
          normalized.startsWith("tmp/") ||
          normalized.endsWith(".DS_Store") ||
          normalized.endsWith(".aux") ||
          normalized.endsWith(".log") ||
          normalized.endsWith(".fls") ||
          normalized.endsWith(".fdb_latexmk") ||
          normalized.endsWith(".synctex.gz") ||
          normalized.endsWith(".out") ||
          normalized.endsWith(".toc") ||
          normalized.endsWith(".xdv")
        ) {
          return true;
        }
        return false;
      };

      const cleanup = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (debounceTimer) clearTimeout(debounceTimer);
        if (watcher) {
          try {
            watcher.close();
          } catch {}
          watcher = null;
        }
      };

      try {
        watcher = fs.watch(projectDir, { recursive: true }, (eventType, filename) => {
          if (filename && shouldIgnore(filename)) return;
          if (filename) changedFiles.add(filename.replace(/\\/g, "/"));

          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            const files = Array.from(changedFiles);
            changedFiles.clear();
            try {
              controller.enqueue(
                encoder.encode(
                  `event: fs-change\ndata: ${JSON.stringify({
                    type: "fs-change",
                    eventType,
                    files,
                    timestamp: Date.now(),
                  })}\n\n`
                )
              );
            } catch {
              cleanup();
            }
          }, 75);
        });
      } catch (err: any) {
        console.warn(`[watch] fs.watch not available on ${projectDir}:`, err.message);
      }

      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (watcher) {
        try {
          watcher.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
