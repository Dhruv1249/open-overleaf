"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import EditorMono from "@monaco-editor/react";

// ── Language detection ────────────────────────────────────────────────────────
function getLanguage(filename?: string): string {
  if (!filename) return "latex";
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return ({
    tex: "latex", cls: "latex", sty: "latex", ltx: "latex",
    bib: "bibtex",
    md: "markdown", markdown: "markdown",
    json: "json", yaml: "yaml", yml: "yaml",
    py: "python", js: "javascript", ts: "typescript",
    sh: "shell", txt: "plaintext",
  } as Record<string, string>)[ext] || "plaintext";
}

// ── Monaco Monarch tokenizer for LaTeX ────────────────────────────────────────
function registerLatex(monaco: any) {
  if (monaco.languages.getLanguages().some((l: any) => l.id === "latex")) return;
  monaco.languages.register({ id: "latex", extensions: [".tex", ".cls", ".sty"], aliases: ["LaTeX", "TeX"] });

  monaco.languages.setMonarchTokensProvider("latex", {
    defaultToken: "",
    tokenizer: {
      root: [
        [/%.*$/, "comment"],
        [/\$\$/, { token: "string.math", next: "@displayMath" }],
        [/\$/, { token: "string.math", next: "@inlineMath" }],
        [/\\(begin|end)\s*\{[^}]*\}/, "keyword.control"],
        [/\\[a-zA-Z@]+\*?/, "keyword"],
        [/[{}]/, "delimiter.curly"],
        [/[\[\]]/, "delimiter.square"],
        [/[0-9]+(\.[0-9]+)?/, "number"],
        [/[_^]/, "keyword.operator"],
      ],
      displayMath: [
        [/\$\$/, { token: "string.math", next: "@pop" }],
        [/\\[a-zA-Z]+\*?/, "keyword.math"],
        [/[_^{}]/, "keyword.operator"],
        [/./, "string.math"],
      ],
      inlineMath: [
        [/\$/, { token: "string.math", next: "@pop" }],
        [/\\[a-zA-Z]+\*?/, "keyword.math"],
        [/[_^{}]/, "keyword.operator"],
        [/./, "string.math"],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration("latex", {
    brackets: [["{", "}"], ["[", "]"], ["(", ")"]],
    comments: { lineComment: "%" },
    autoClosingPairs: [
      { open: "{", close: "}" }, { open: "[", close: "]" },
      { open: "(", close: ")" }, { open: "$", close: "$" },
    ],
    surroundingPairs: [
      { open: "{", close: "}" }, { open: "[", close: "]" }, { open: "$", close: "$" },
    ],
    indentationRules: {
      increaseIndentPattern: /\\begin\{[^}]*\}/,
      decreaseIndentPattern: /\\end\{[^}]*\}/,
    },
  });
}

function registerBibtex(monaco: any) {
  if (monaco.languages.getLanguages().some((l: any) => l.id === "bibtex")) return;
  monaco.languages.register({ id: "bibtex", extensions: [".bib"], aliases: ["BibTeX"] });
  monaco.languages.setMonarchTokensProvider("bibtex", {
    defaultToken: "",
    tokenizer: {
      root: [
        [/@[a-zA-Z]+/, "keyword"],
        [/[{}]/, "delimiter.curly"],
        [/"[^"]*"/, "string"],
        [/[a-zA-Z0-9_]+(?=\s*=)/, "variable"],
        [/#.*$/, "comment"],
      ],
    },
  });
}

// ── Monaco themes ─────────────────────────────────────────────────────────────
function defineThemes(monaco: any) {
  const tokenRules = [
    { token: "keyword",          foreground: "c8a96e", fontStyle: "bold" },
    { token: "keyword.control",  foreground: "e09050", fontStyle: "bold" },
    { token: "keyword.math",     foreground: "c8a96e" },
    { token: "keyword.operator", foreground: "c8a96e" },
    { token: "comment",          foreground: "4a5568", fontStyle: "italic" },
    { token: "string.math",      foreground: "6ec88a" },
    { token: "delimiter.curly",  foreground: "8899aa" },
    { token: "delimiter.square", foreground: "8899aa" },
    { token: "number",           foreground: "a0c8a0" },
    { token: "variable",         foreground: "78b4c8" },
    { token: "string",           foreground: "98c8a0" },
  ];

  monaco.editor.defineTheme("oo-dark", {
    base: "vs-dark", inherit: true, rules: tokenRules,
    colors: {
      "editor.background":                "#0d0f14",
      "editor.foreground":                "#d8d4c8",
      "editor.lineHighlightBackground":   "#14181f",
      "editorLineNumber.foreground":      "#3a4050",
      "editorLineNumber.activeForeground":"#c8a96e",
      "editor.selectionBackground":       "#c8a96e22",
      "editor.wordHighlightBackground":   "#c8a96e15",
      "editorCursor.foreground":          "#c8a96e",
      "editorIndentGuide.background1":    "#1e2230",
      "editorBracketMatch.background":    "#c8a96e20",
      "editorBracketMatch.border":        "#c8a96e",
      "editorError.foreground":           "#cc5555",
      "editorWarning.foreground":         "#c8a96e",
      "editorInfo.foreground":            "#6ab4c8",
    },
  });

  monaco.editor.defineTheme("oo-light", {
    base: "vs", inherit: true, rules: [
      { token: "keyword",          foreground: "7a5a18", fontStyle: "bold" },
      { token: "keyword.control",  foreground: "905020", fontStyle: "bold" },
      { token: "keyword.math",     foreground: "7a5a18" },
      { token: "keyword.operator", foreground: "7a5a18" },
      { token: "comment",          foreground: "888888", fontStyle: "italic" },
      { token: "string.math",      foreground: "2a7a4a" },
      { token: "delimiter.curly",  foreground: "667788" },
      { token: "delimiter.square", foreground: "667788" },
      { token: "number",           foreground: "2a6a2a" },
      { token: "variable",         foreground: "286090" },
      { token: "string",           foreground: "307830" },
    ],
    colors: {
      "editor.background":                "#faf7f0",
      "editor.foreground":                "#2a2520",
      "editor.lineHighlightBackground":   "#f2ede4",
      "editorLineNumber.foreground":      "#b8b0a4",
      "editorLineNumber.activeForeground":"#7a5a18",
      "editor.selectionBackground":       "#c8a96e33",
      "editor.wordHighlightBackground":   "#c8a96e18",
      "editorCursor.foreground":          "#7a5a18",
      "editorBracketMatch.background":    "#c8a96e25",
      "editorBracketMatch.border":        "#c8a96e",
      "editorError.foreground":           "#aa2222",
      "editorWarning.foreground":         "#886600",
      "editorInfo.foreground":            "#206090",
    },
  });
}

function getMonacoTheme(): string {
  return document.documentElement.classList.contains("theme-light") ? "oo-light" : "oo-dark";
}

// ── TexLab LSP client ─────────────────────────────────────────────────────────
// Connects to ws://localhost:3001 which bridges JSON-RPC <-> texlab stdio.
// Implements a minimal subset of LSP:
//   - initialize / initialized handshake
//   - textDocument/didOpen, didChange, didClose
//   - textDocument/publishDiagnostics → Monaco markers
//   - textDocument/completion (forwarded to Monaco as CompletionItemProvider)
//   - textDocument/hover (forwarded to Monaco as HoverProvider)

class TexLabClient {
  private ws: WebSocket | null = null;
  private msgId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private onDiagnostics: ((params: any) => void) | null = null;
  private initialized = false;
  private queue: string[] = []; // messages queued before init

  connect(onDiagnostics: (params: any) => void): Promise<void> {
    this.onDiagnostics = onDiagnostics;
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket("ws://localhost:3100");
      } catch (e) {
        return reject(e);
      }

      this.ws.onopen = async () => {
        try {
          await this.sendRequest("initialize", {
            processId: null,
            clientInfo: { name: "open-overleaf", version: "0.1.0" },
            capabilities: {
              textDocument: {
                completion: {
                  completionItem: {
                    snippetSupport: true,
                    documentationFormat: ["plaintext"],
                  },
                },
                hover: { contentFormat: ["plaintext"] },
                publishDiagnostics: { versionSupport: true },
                synchronization: { didSave: true },
              },
            },
            rootUri: null,
            workspaceFolders: null,
          });
          this.sendNotification("initialized", {});
          this.initialized = true;
          // Flush queued messages
          for (const msg of this.queue) this.ws?.send(msg);
          this.queue = [];
          resolve();
        } catch (e) {
          reject(e);
        }
      };

      this.ws.onerror = (e) => {
        console.warn("[texlab] WebSocket error — LSP features unavailable");
        reject(new Error("WebSocket error"));
      };

      this.ws.onclose = () => {
        console.log("[texlab] WebSocket closed");
        this.ws = null;
      };

      this.ws.onmessage = (event) => {
        let msg: any;
        try { msg = JSON.parse(event.data); } catch { return; }

        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        } else if (msg.method === "textDocument/publishDiagnostics") {
          this.onDiagnostics?.(msg.params);
        }
        // Ignore other server->client notifications
      };
    });
  }

  private send(msg: object) {
    const str = JSON.stringify(msg);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(str);
    } else if (!this.initialized) {
      this.queue.push(str);
    }
  }

  sendRequest(method: string, params: any): Promise<any> {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ jsonrpc: "2.0", id, method, params });
      // Timeout after 8s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`LSP request timeout: ${method}`));
        }
      }, 8000);
    });
  }

  sendNotification(method: string, params: any) {
    this.send({ jsonrpc: "2.0", method, params });
  }

  isConnected() {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  dispose() {
    this.ws?.close();
    this.ws = null;
    this.pending.clear();
  }
}

// Module-level singleton so re-renders don't spawn multiple connections
let globalLspClient: TexLabClient | null = null;
let lspConnecting = false;

async function getLspClient(onDiagnostics: (params: any) => void): Promise<TexLabClient | null> {
  if (globalLspClient?.isConnected()) return globalLspClient;
  if (lspConnecting) return null;
  lspConnecting = true;
  try {
    const client = new TexLabClient();
    await client.connect(onDiagnostics);
    globalLspClient = client;
    return client;
  } catch {
    return null;
  } finally {
    lspConnecting = false;
  }
}

// ── LSP URI helpers ───────────────────────────────────────────────────────────
function fileUriForPath(project: string, path: string) {
  return `file:///workspace/${project}/${path}`;
}

// ── Editor component ──────────────────────────────────────────────────────────
type EditorProps = {
  content: string;
  onSave: (newContent: string) => Promise<void>;
  filename?: string;
  project?: string;
  filePath?: string;  // path relative to project root for LSP
};

export default function Editor({ content: initial, onSave, filename, project, filePath }: EditorProps) {
  const [value, setValue] = useState(initial || "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lspStatus, setLspStatus] = useState<"connecting" | "connected" | "offline">("offline");
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const lspRef = useRef<TexLabClient | null>(null);
  const docVersion = useRef(0);
  const language = getLanguage(filename);

  // Sync content when file changes
  useEffect(() => {
    setValue(initial || "");
    setDirty(false);
    docVersion.current = 0;
  }, [initial, filename]);

  // ── Monaco theme sync — set up INSIDE handleEditorMount so monaco is ready ──
  // (useEffect with [] runs before Monaco loads, so we can't do it there)
  const themeObserverRef = useRef<MutationObserver | null>(null);

  // ── Connect to TexLab LSP ──────────────────────────────────────────────────
  useEffect(() => {
    if (language !== "latex" && language !== "bibtex") return;
    let cancelled = false;
    setLspStatus("connecting");

    const onDiagnostics = (params: any) => {
      if (!monacoRef.current || cancelled) return;
      const monaco = monacoRef.current;
      const model = editorRef.current?.getModel();
      if (!model) return;

      const markers = (params.diagnostics || []).map((d: any) => ({
        message: d.message,
        severity:
          d.severity === 1 ? monaco.MarkerSeverity.Error
          : d.severity === 2 ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Information,
        startLineNumber: (d.range?.start?.line ?? 0) + 1,
        startColumn: (d.range?.start?.character ?? 0) + 1,
        endLineNumber: (d.range?.end?.line ?? 0) + 1,
        endColumn: (d.range?.end?.character ?? 0) + 1,
        source: "texlab",
        code: d.code,
      }));
      monaco.editor.setModelMarkers(model, "texlab", markers);
    };

    getLspClient(onDiagnostics).then((client) => {
      if (cancelled || !client) {
        if (!cancelled) setLspStatus("offline");
        return;
      }
      lspRef.current = client;
      setLspStatus("connected");

      // Open the document in texlab
      if (filePath && project) {
        client.sendNotification("textDocument/didOpen", {
          textDocument: {
            uri: fileUriForPath(project, filePath),
            languageId: language,
            version: ++docVersion.current,
            text: initial || "",
          },
        });
      }
    });

    return () => {
      cancelled = true;
      // Close doc in texlab when unmounting
      if (lspRef.current && filePath && project) {
        lspRef.current.sendNotification("textDocument/didClose", {
          textDocument: { uri: fileUriForPath(project, filePath) },
        });
      }
    };
  }, [language, filePath, project, initial]);

  const handleChange = (v: string | undefined) => {
    const newVal = v || "";
    setValue(newVal);
    setDirty(newVal !== initial);

    // Notify LSP of change
    if (lspRef.current && filePath && project) {
      lspRef.current.sendNotification("textDocument/didChange", {
        textDocument: {
          uri: fileUriForPath(project, filePath),
          version: ++docVersion.current,
        },
        contentChanges: [{ text: newVal }],
      });
    }
  };

  const handleSave = useCallback(async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSave(value);
      setDirty(false);
      // Notify LSP of save
      if (lspRef.current && filePath && project) {
        lspRef.current.sendNotification("textDocument/didSave", {
          textDocument: { uri: fileUriForPath(project, filePath) },
        });
      }
    } finally {
      setSaving(false);
    }
  }, [dirty, saving, value, onSave, filePath, project]);

  // Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); handleSave(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  // ── Monaco mount ──────────────────────────────────────────────────────────
  const handleEditorMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    registerLatex(monaco);
    registerBibtex(monaco);
    defineThemes(monaco);

    // ── Theme sync via MutationObserver ────────────────────────────────────
    // Must be set up here (not in useEffect) because Monaco needs to be loaded first.
    const applyTheme = () => {
      const theme = getMonacoTheme();
      monaco.editor.setTheme(theme);
    };
    applyTheme(); // apply immediately
    const themeObserver = new MutationObserver(applyTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    themeObserverRef.current = themeObserver;
    // Clean up when the editor instance is destroyed
    editor.onDidDispose(() => themeObserver.disconnect());

    // ── Completion provider (backed by TexLab) ──────────────────────────────
    monaco.languages.registerCompletionItemProvider("latex", {
      triggerCharacters: ["\\", "{"],
      provideCompletionItems: async (model: any, position: any) => {
        const client = lspRef.current;
        if (!client || !filePath || !project) return { suggestions: [] };
        try {
          const result = await client.sendRequest("textDocument/completion", {
            textDocument: { uri: fileUriForPath(project, filePath) },
            position: { line: position.lineNumber - 1, character: position.column - 1 },
            context: { triggerKind: 1 },
          });
          const items = Array.isArray(result) ? result : result?.items || [];
          return {
            suggestions: items.map((item: any) => ({
              label: item.label,
              kind: item.kind ?? monaco.languages.CompletionItemKind.Function,
              detail: item.detail,
              documentation: item.documentation?.value || item.documentation,
              insertText: item.textEdit?.newText || item.insertText || item.label,
              insertTextRules: item.insertTextFormat === 2
                ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                : undefined,
              range: item.textEdit?.range ? {
                startLineNumber: item.textEdit.range.start.line + 1,
                startColumn: item.textEdit.range.start.character + 1,
                endLineNumber: item.textEdit.range.end.line + 1,
                endColumn: item.textEdit.range.end.character + 1,
              } : undefined,
            })),
          };
        } catch {
          return { suggestions: [] };
        }
      },
    });

    // ── Hover provider (backed by TexLab) ───────────────────────────────────
    monaco.languages.registerHoverProvider("latex", {
      provideHover: async (model: any, position: any) => {
        const client = lspRef.current;
        if (!client || !filePath || !project) return null;
        try {
          const result = await client.sendRequest("textDocument/hover", {
            textDocument: { uri: fileUriForPath(project, filePath) },
            position: { line: position.lineNumber - 1, character: position.column - 1 },
          });
          if (!result) return null;
          const content = typeof result.contents === "string"
            ? result.contents
            : result.contents?.value || result.contents?.join?.("\n") || "";
          if (!content) return null;
          return { contents: [{ value: content }] };
        } catch {
          return null;
        }
      },
    });
  }, [filePath, project]);

  // ── Render ────────────────────────────────────────────────────────────────
  const lspDot = lspStatus === "connected"
    ? <span title="TexLab LSP connected" style={{ color: "var(--ink-success)", fontSize: 9 }}>● LSP</span>
    : lspStatus === "connecting"
    ? <span title="Connecting to TexLab…" style={{ color: "var(--lamp)", fontSize: 9 }}>◌ LSP</span>
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Toolbar */}
      <div className="editor-toolbar" style={{ height: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {filename && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--quill-secondary)" }}>
              {filename}
            </span>
          )}
          {language !== "plaintext" && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--quill-muted)" }}>
              {language}
            </span>
          )}
          {(language === "latex" || language === "bibtex") && lspDot}
          {dirty && <span className="chip chip-warn" style={{ fontSize: 10 }}>unsaved</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "var(--quill-muted)", fontFamily: "var(--font-mono)" }}>⌘S</span>
          <button
            className={`btn-sm ${dirty ? "btn-primary" : ""}`}
            onClick={handleSave}
            disabled={!dirty || saving}
            style={{ opacity: !dirty ? 0.5 : 1 }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Monaco */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <EditorMono
          height="100%"
          language={language}
          value={value}
          onChange={handleChange}
          onMount={handleEditorMount}
          theme="oo-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            fontLigatures: true,
            lineHeight: 22,
            padding: { top: 16, bottom: 16 },
            renderLineHighlight: "gutter",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            wrappingIndent: "same",
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            tabSize: 2,
            renderWhitespace: "none",
            overviewRulerLanes: 1,
            hideCursorInOverviewRuler: false,
            guides: { bracketPairs: true, indentation: true },
            // Completion
            suggestOnTriggerCharacters: true,
            quickSuggestions: { other: true, comments: false, strings: false },
            acceptSuggestionOnEnter: "on",
            snippetSuggestions: "top",
            suggest: { showSnippets: true },
          }}
        />
      </div>
    </div>
  );
}
