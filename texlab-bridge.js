import { WebSocketServer } from "ws";
import { spawn, execSync } from "child_process";
import http from "http";
import fs from "fs";
import path from "path";

const PORT = 3100;
const WORKSPACE_BASE = "/tmp/oo-workspace";
const CLIENT_BASE = "file:///workspace";

fs.mkdirSync(WORKSPACE_BASE, { recursive: true });

let TEXLAB_PATH = "texlab";
try {
  TEXLAB_PATH = execSync("which texlab 2>/dev/null || echo texlab").toString().trim();
} catch {
  TEXLAB_PATH = "texlab";
}

function clientUriToDisk(uri) {
  if (uri && uri.startsWith(CLIENT_BASE + "/")) {
    const relativePath = uri.slice(CLIENT_BASE.length + 1);
    return path.join(WORKSPACE_BASE, relativePath);
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

const URI_KEYS = new Set(["uri", "rootUri", "targetUri", "originSelectionRange"]);

function translateUris(objectPayload, translationFunction) {
  if (!objectPayload || typeof objectPayload !== "object") return objectPayload;
  if (Array.isArray(objectPayload)) return objectPayload.map(item => translateUris(item, translationFunction));
  const translatedResult = {};
  for (const [key, value] of Object.entries(objectPayload)) {
    if (URI_KEYS.has(key) && typeof value === "string") {
      translatedResult[key] = translationFunction(value);
    } else {
      translatedResult[key] = translateUris(value, translationFunction);
    }
  }
  return translatedResult;
}

function writeToDisk(clientUri, content) {
  const diskPath = clientUriToDisk(clientUri);
  if (!diskPath) return;
  try {
    fs.mkdirSync(path.dirname(diskPath), { recursive: true });
    fs.writeFileSync(diskPath, content, "utf8");
  } catch (error: any) {
    console.error("[texlab-bridge] write failed:", diskPath, error.message);
  }
}

function preprocessClientMsg(messagePayload) {
  try {
    if (!messagePayload || typeof messagePayload !== "object") return messagePayload;

    if (messagePayload.method === "textDocument/didOpen") {
      const uri = messagePayload.params?.textDocument?.uri;
      const text = messagePayload.params?.textDocument?.text;
      if (uri && text !== undefined) writeToDisk(uri, text);
    } else if (messagePayload.method === "textDocument/didChange") {
      const uri = messagePayload.params?.textDocument?.uri;
      const text = messagePayload.params?.contentChanges?.[0]?.text;
      if (uri && text !== undefined) writeToDisk(uri, text);
    } else if (messagePayload.method === "initialize" && messagePayload.params?.workspaceFolders) {
      for (const workspaceFolder of messagePayload.params.workspaceFolders) {
        const diskPath = clientUriToDisk(workspaceFolder.uri);
        if (diskPath) fs.mkdirSync(diskPath, { recursive: true });
      }
    }

    return translateUris(messagePayload, clientUriToServer);
  } catch (error: any) {
    console.error("[texlab-bridge] preprocess error:", error.message);
    return messagePayload;
  }
}

function postprocessServerMsg(messagePayload) {
  try {
    return translateUris(messagePayload, serverUriToClient);
  } catch {
    return messagePayload;
  }
}

const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "texlab-bridge", port: PORT }));
});

const wss = new WebSocketServer({ server: httpServer });
console.log(`[texlab-bridge] Starting on port ${PORT}`);

wss.on("connection", (ws) => {
  console.log("[texlab-bridge] Client connected");

  const texlabProcess = spawn(TEXLAB_PATH, [], {
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  texlabProcess.on("error", (err) => {
    console.error("[texlab-bridge] Failed to start texlab:", err.message);
    ws.close(1011, "texlab failed to start");
  });

  texlabProcess.on("exit", (code) => {
    console.log(`[texlab-bridge] texlab exited code=${code}`);
    try { if (ws.readyState === ws.OPEN) ws.close(1000, "texlab exited"); } catch {}
  });

  texlabProcess.stderr.on("data", (data) => {
    process.stderr.write("[texlab] " + data);
  });

  let bufferData = Buffer.alloc(0);
  texlabProcess.stdout.on("data", (chunk) => {
    bufferData = Buffer.concat([bufferData, chunk]);
    while (bufferData.length > 0) {
      const separatorIndex = bufferData.indexOf("\r\n\r\n");
      if (separatorIndex === -1) break;

      const headerString = bufferData.slice(0, separatorIndex).toString("utf8");
      const matchLength = headerString.match(/content-length:\s*(\d+)/i);
      if (!matchLength) { bufferData = bufferData.slice(1); continue; }

      const contentLength = parseInt(matchLength[1], 10);
      const bodyStartIndex = separatorIndex + 4;
      const bodyEndIndex = bodyStartIndex + contentLength;
      if (bufferData.length < bodyEndIndex) break;

      const jsonString = bufferData.slice(bodyStartIndex, bodyEndIndex).toString("utf8");
      bufferData = bufferData.slice(bodyEndIndex);

      try {
        const messageObject = JSON.parse(jsonString);
        const translatedObject = postprocessServerMsg(messageObject);
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify(translatedObject));
        }
      } catch (parseError: any) {
        console.error("[texlab-bridge] JSON parse error:", parseError.message);
      }
    }
  });

  ws.on("message", (data) => {
    try {
      const jsonString = typeof data === "string" ? data : data.toString();
      const messageObject = JSON.parse(jsonString);
      const processedObject = preprocessClientMsg(messageObject);
      const encodedBuffer = Buffer.from(JSON.stringify(processedObject), "utf8");
      texlabProcess.stdin.write(`Content-Length: ${encodedBuffer.length}\r\n\r\n`);
      texlabProcess.stdin.write(encodedBuffer);
    } catch (writeError) {
      console.error("[texlab-bridge] stdin write error:", writeError);
    }
  });

  ws.on("close", () => {
    try {
      const shutdownString = JSON.stringify({ jsonrpc: "2.0", id: 9999, method: "shutdown", params: null });
      const encodedShutdown = Buffer.from(shutdownString, "utf8");
      texlabProcess.stdin.write(`Content-Length: ${encodedShutdown.length}\r\n\r\n`);
      texlabProcess.stdin.write(encodedShutdown);
      setTimeout(() => {
        const exitString = JSON.stringify({ jsonrpc: "2.0", method: "exit", params: null });
        const encodedExit = Buffer.from(exitString, "utf8");
        texlabProcess.stdin.write(`Content-Length: ${encodedExit.length}\r\n\r\n`);
        texlabProcess.stdin.write(encodedExit);
        texlabProcess.stdin.end();
      }, 300);
    } catch {
      try { texlabProcess.kill("SIGTERM"); } catch {}
    }
  });

  ws.on("error", (err) => {
    console.error("[texlab-bridge] ws error:", err.message);
    try { texlabProcess.kill("SIGTERM"); } catch {}
  });
});

httpServer.on("error", (err: any) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[texlab-bridge] Port ${PORT} in use.`);
    process.exit(1);
  }
  console.error("[texlab-bridge] Server error:", err);
});

httpServer.listen(PORT, () => {
  console.log(`[texlab-bridge] Ready — ws://localhost:${PORT}`);
});
