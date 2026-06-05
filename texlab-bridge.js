/**
 * TexLab LSP WebSocket Bridge — port 3100
 * Spawns one texlab process per WebSocket client, bridging JSON-RPC over stdio ↔ WebSocket.
 */

const { WebSocketServer } = require("ws");
const { spawn, execSync } = require("child_process");
const http = require("http");

const PORT = 3100;

// Resolve texlab binary
let TEXLAB_PATH = "texlab";
try {
  TEXLAB_PATH = execSync("which texlab 2>/dev/null || echo texlab").toString().trim();
} catch {
  TEXLAB_PATH = "texlab";
}

// Create an HTTP server so we can share with WS and also serve a health endpoint
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "texlab-bridge", port: PORT }));
});

const wss = new WebSocketServer({ server: httpServer });

console.log(`[texlab-bridge] Starting on port ${PORT}`);
console.log(`[texlab-bridge] texlab binary: ${TEXLAB_PATH}`);

wss.on("connection", (ws, req) => {
  console.log(`[texlab-bridge] Client connected`);

  const texlab = spawn(TEXLAB_PATH, [], {
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  texlab.on("error", (err) => {
    console.error("[texlab-bridge] Failed to start texlab:", err.message);
    ws.close(1011, "texlab failed to start");
  });

  texlab.on("exit", (code) => {
    console.log(`[texlab-bridge] texlab exited code=${code}`);
    try { if (ws.readyState === ws.OPEN) ws.close(1000, "texlab exited"); } catch {}
  });

  texlab.stderr.on("data", (data) => {
    // texlab writes verbose logs to stderr — suppress by default, uncomment to debug:
    // process.stderr.write("[texlab] " + data);
  });

  // ── texlab stdout → WebSocket ─────────────────────────────────────────────
  // LSP wire format: "Content-Length: N\r\n\r\n" + N bytes of JSON
  let buffer = Buffer.alloc(0);

  texlab.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length > 0) {
      // Find the header separator
      const sep = buffer.indexOf("\r\n\r\n");
      if (sep === -1) break; // incomplete header

      const headerStr = buffer.slice(0, sep).toString("utf8");
      const match = headerStr.match(/Content-Length:\s*(\d+)/);
      if (!match) {
        // Malformed — skip one byte and retry
        buffer = buffer.slice(1);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const bodyStart = sep + 4; // skip \r\n\r\n
      const bodyEnd = bodyStart + contentLength;

      if (buffer.length < bodyEnd) break; // need more data

      const json = buffer.slice(bodyStart, bodyEnd).toString("utf8");
      buffer = buffer.slice(bodyEnd);

      if (ws.readyState === ws.OPEN) {
        ws.send(json);
      }
    }
  });

  // ── WebSocket → texlab stdin ──────────────────────────────────────────────
  ws.on("message", (data) => {
    try {
      const json = typeof data === "string" ? data : data.toString();
      const encoded = Buffer.from(json, "utf8");
      const header = `Content-Length: ${encoded.length}\r\n\r\n`;
      texlab.stdin.write(header);
      texlab.stdin.write(encoded);
    } catch (e) {
      console.error("[texlab-bridge] stdin write error:", e);
    }
  });

  ws.on("close", () => {
    console.log("[texlab-bridge] Client disconnected");
    try { texlab.kill("SIGTERM"); } catch {}
  });

  ws.on("error", (err) => {
    console.error("[texlab-bridge] ws error:", err.message);
    try { texlab.kill("SIGTERM"); } catch {}
  });
});

httpServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[texlab-bridge] Port ${PORT} is already in use.`);
    console.error(`[texlab-bridge] Run: fuser -k ${PORT}/tcp && npm run dev:lsp`);
    process.exit(1);
  } else {
    console.error("[texlab-bridge] Server error:", err);
  }
});

httpServer.listen(PORT, () => {
  console.log(`[texlab-bridge] Ready — ws://localhost:${PORT}`);
});
