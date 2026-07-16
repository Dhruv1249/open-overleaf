/**
 * TexLab LSP WebSocket Bridge — port 3100
 *
 * Key responsibilities beyond basic stdio↔WebSocket bridging:
 * 1. Write files to disk (/tmp/oo-workspace/...) so TexLab sees real files
 * 2. Translate URIs: client uses file:///workspace/... ↔ TexLab uses file:///tmp/oo-workspace/...
 * 3. Parse LSP Content-Length framing correctly (case-insensitive)
 */

const { WebSocketServer } = require("ws");
const { spawn, execSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3100;
const WORKSPACE_BASE = "/tmp/oo-workspace";
const CLIENT_BASE = "file:///workspace";

// Ensure base workspace dir exists
fs.mkdirSync(WORKSPACE_BASE, { recursive: true });

// Resolve texlab binary
let TEXLAB_PATH = "texlab";
try {
  TEXLAB_PATH = execSync("which texlab 2>/dev/null || echo texlab").toString().trim();
} catch {
  TEXLAB_PATH = "texlab";
}

// ── URI translation ───────────────────────────────────────────────────────────
function clientUriToDisk(uri) {
  if (uri && uri.startsWith(CLIENT_BASE + "/")) {
    const relPath = uri.slice(CLIENT_BASE.length + 1); // remove "file:///workspace/"
    return path.join(WORKSPACE_BASE, relPath);
  }
  return null;
}

function clientUriToServer(uri) {
  if (uri && uri.startsWith(CLIENT_BASE + "/")) {
    return "file://" + path.join(WORKSPACE_BASE, uri.slice(CLIENT_BASE.length + 1));
  }
  return uri;
}

function serverUriToClient(uri) {
  if (!uri) return uri;
  const serverBase = "file://" + WORKSPACE_BASE;
  if (uri.startsWith(serverBase + "/") || uri === serverBase) {
    return CLIENT_BASE + uri.slice(serverBase.length);
  }
  return uri;
}

// Keys in LSP messages that hold URIs and need translation
const URI_KEYS = new Set(["uri", "rootUri", "targetUri", "originSelectionRange"]);

// Recursively translate all URI strings in a JSON object
function translateUris(obj, fn) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(item => translateUris(item, fn));
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (URI_KEYS.has(k) && typeof v === "string") {
      result[k] = fn(v);
    } else {
      result[k] = translateUris(v, fn);
    }
  }
  return result;
}

// ── Write file to disk for a given client URI + content ───────────────────────
function writeToDisk(clientUri, content) {
  const diskPath = clientUriToDisk(clientUri);
  if (!diskPath) return;
  try {
    fs.mkdirSync(path.dirname(diskPath), { recursive: true });
    fs.writeFileSync(diskPath, content, "utf8");
  } catch (e) {
    console.error("[texlab-bridge] write failed:", diskPath, e.message);
  }
}

// ── Preprocess message going Client → TexLab ──────────────────────────────────
function preprocessClientMsg(msg) {
  try {
    if (!msg || typeof msg !== "object") return msg;

    // Write content to disk so TexLab can read real files
    if (msg.method === "textDocument/didOpen") {
      const uri = msg.params?.textDocument?.uri;
      const text = msg.params?.textDocument?.text;
      if (uri && text !== undefined) writeToDisk(uri, text);
    } else if (msg.method === "textDocument/didChange") {
      const uri = msg.params?.textDocument?.uri;
      const text = msg.params?.contentChanges?.[0]?.text;
      if (uri && text !== undefined) writeToDisk(uri, text);
    } else if (msg.method === "textDocument/didSave") {
      // nothing extra needed
    } else if (msg.method === "initialize" && msg.params?.workspaceFolders) {
      // Create workspace dirs
      for (const wf of msg.params.workspaceFolders) {
        const diskPath = clientUriToDisk(wf.uri);
        if (diskPath) fs.mkdirSync(diskPath, { recursive: true });
      }
    }

    // Translate all URIs from client scheme → server scheme
    return translateUris(msg, clientUriToServer);
  } catch (e) {
    console.error("[texlab-bridge] preprocess error:", e.message);
    return msg;
  }
}

// ── Postprocess message going TexLab → Client ─────────────────────────────────
function postprocessServerMsg(msg) {
  try {
    return translateUris(msg, serverUriToClient);
  } catch {
    return msg;
  }
}

// ── HTTP / WebSocket server ───────────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "texlab-bridge", port: PORT }));
});

const wss = new WebSocketServer({ server: httpServer });
console.log(`[texlab-bridge] Starting on port ${PORT}`);
console.log(`[texlab-bridge] texlab binary: ${TEXLAB_PATH}`);
console.log(`[texlab-bridge] workspace: ${WORKSPACE_BASE}`);

wss.on("connection", (ws) => {
  console.log("[texlab-bridge] Client connected");

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
    // Log TexLab stderr so we can see initialization/parsing errors
    process.stderr.write("[texlab] " + data);
  });

  // ── TexLab stdout → WebSocket ─────────────────────────────────────────────
  let buf = Buffer.alloc(0);
  texlab.stdout.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length > 0) {
      const sep = buf.indexOf("\r\n\r\n");
      if (sep === -1) break;

      const headerStr = buf.slice(0, sep).toString("utf8");
      // case-insensitive Content-Length parse (LSP spec allows any case)
      const match = headerStr.match(/content-length:\s*(\d+)/i);
      if (!match) { buf = buf.slice(1); continue; }

      const contentLength = parseInt(match[1], 10);
      const bodyStart = sep + 4;
      const bodyEnd = bodyStart + contentLength;
      if (buf.length < bodyEnd) break;

      const json = buf.slice(bodyStart, bodyEnd).toString("utf8");
      buf = buf.slice(bodyEnd);

      try {
        const msg = JSON.parse(json);
        const translated = postprocessServerMsg(msg);
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify(translated));
        }
      } catch (e) {
        console.error("[texlab-bridge] JSON parse error:", e.message);
      }
    }
  });

  // ── WebSocket → TexLab stdin ──────────────────────────────────────────────
  ws.on("message", (data) => {
    try {
      const json = typeof data === "string" ? data : data.toString();
      const msg = JSON.parse(json);
      const processed = preprocessClientMsg(msg);
      const encoded = Buffer.from(JSON.stringify(processed), "utf8");
      texlab.stdin.write(`Content-Length: ${encoded.length}\r\n\r\n`);
      texlab.stdin.write(encoded);
    } catch (e) {
      console.error("[texlab-bridge] stdin write error:", e);
    }
  });

  ws.on("close", () => {
    console.log("[texlab-bridge] Client disconnected — sending LSP shutdown");
    try {
      // Proper LSP shutdown sequence
      const shutdown = JSON.stringify({ jsonrpc: "2.0", id: 9999, method: "shutdown", params: null });
      const enc = Buffer.from(shutdown, "utf8");
      texlab.stdin.write(`Content-Length: ${enc.length}\r\n\r\n`);
      texlab.stdin.write(enc);
      setTimeout(() => {
        const exit = JSON.stringify({ jsonrpc: "2.0", method: "exit", params: null });
        const e2 = Buffer.from(exit, "utf8");
        texlab.stdin.write(`Content-Length: ${e2.length}\r\n\r\n`);
        texlab.stdin.write(e2);
        texlab.stdin.end();
      }, 300);
    } catch {
      try { texlab.kill("SIGTERM"); } catch {}
    }
  });

  ws.on("error", (err) => {
    console.error("[texlab-bridge] ws error:", err.message);
    try { texlab.kill("SIGTERM"); } catch {}
  });
});

httpServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[texlab-bridge] Port ${PORT} in use. Run: fuser -k ${PORT}/tcp`);
    process.exit(1);
  }
  console.error("[texlab-bridge] Server error:", err);
});

httpServer.listen(PORT, () => {
  console.log(`[texlab-bridge] Ready — ws://localhost:${PORT}`);
});
