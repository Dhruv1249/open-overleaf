"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import EditorMono from "@monaco-editor/react";
import { LATEX_COMMANDS, ENVIRONMENTS, PACKAGES, DOCUMENT_CLASSES, type LatexCompletion } from "../lib/latex-completions";
import { parseDocumentCommands, buildInsertText, type ParsedCommand } from "../lib/latex-doc-parser";

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

// ── LSP file URI (bridge translates to disk path transparently) ───────────────
function fileUri(project: string, path: string) {
  return `file:///workspace/${project}/${path}`;
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
  const darkRules = [
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
    base: "vs-dark", inherit: true, rules: darkRules,
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
    base: "vs", inherit: true,
    rules: [
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

// ── One-time provider registration guard ─────────────────────────────────────
const _registeredProviders = new WeakSet<object>();

function registerProvidersOnce(monaco: any, getModel: () => any, getLsp: () => LspClient | null) {
  if (_registeredProviders.has(monaco)) return;
  _registeredProviders.add(monaco);

  const CIK = monaco.languages.CompletionItemKind;
  const CITR = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;

  const kindMap: Record<string, number> = {
    Function: CIK.Function,
    Keyword:  CIK.Keyword,
    Constant: CIK.Constant,
    Snippet:  CIK.Snippet,
    Value:    CIK.Value,
    Module:   CIK.Module,
  };

  // ── LaTeX command & environment completions ───────────────────────────────
  monaco.languages.registerCompletionItemProvider("latex", {
    triggerCharacters: ["\\", "{"],
    provideCompletionItems: (model: any, position: any) => {
      const lineText  = model.getLineContent(position.lineNumber);
      const textToCursor = lineText.slice(0, position.column - 1);

      // ── Context: inside \begin{...} or \end{...} → show environments ────
      const envCtx = textToCursor.match(/\\(?:begin|end)\{([^}]*)$/);
      if (envCtx) {
        const typed = envCtx[1].toLowerCase();
        // Parse document for custom environments too
        const docEnvs = parseDocumentCommands(model.getValue())
          .filter((c: ParsedCommand) => c.isEnv)
          .map((c: ParsedCommand) => c.name);
        const allEnvs = [...new Set([...ENVIRONMENTS.map((e: { name: string }) => e.name), ...docEnvs])];
        const matchedEnvs = allEnvs.filter(e => e.toLowerCase().startsWith(typed));
        const wordInfo = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
          startColumn: wordInfo.startColumn, endColumn: wordInfo.endColumn,
        };
        return {
          suggestions: matchedEnvs.map((name) => {
            const envDef = ENVIRONMENTS.find((e: { name: string }) => e.name === name);
            const isDocEnv = docEnvs.includes(name) && !ENVIRONMENTS.find((e: { name: string }) => e.name === name);
            const bodySnip = envDef?.insertBody ?? "  $0";
            // Snippet: environment name expanded with body template
            const insertText = envCtx[0].startsWith("\\begin")
              ? `${name}}\n${bodySnip}\n\\end{${name}}`
              : `${name}}`;
            return {
              label:      name,
              filterText: name,
              kind:       CIK.Class,
              detail:     envDef?.detail ?? (isDocEnv ? "user-defined environment" : "environment"),
              insertText: insertText,
              insertTextRules: CITR,
              range,
              sortText: isDocEnv ? `0${name}` : `1${name}`,
            };
          }),
        };
      }

      // ── Context: inside \usepackage{...} → show package names ───────────
      const pkgCtx = textToCursor.match(/\\usepackage(?:\[[^\]]*\])?\{([^}]*)$/);
      if (pkgCtx) {
        const typed = pkgCtx[1].toLowerCase();
        const wordInfo = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
          startColumn: wordInfo.startColumn, endColumn: wordInfo.endColumn,
        };
        return {
          suggestions: PACKAGES
          .filter((p: string) => p.toLowerCase().startsWith(typed))
          .map((p: string) => ({
              label: p, filterText: p, insertText: p,
              kind: CIK.Module, detail: "package",
              range, sortText: p,
            })),
        };
      }

      // ── Context: inside \documentclass{...} → show class names ──────────
      const clsCtx = textToCursor.match(/\\documentclass(?:\[[^\]]*\])?\{([^}]*)$/);
      if (clsCtx) {
        const typed = clsCtx[1].toLowerCase();
        const wordInfo = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
          startColumn: wordInfo.startColumn, endColumn: wordInfo.endColumn,
        };
        return {
          suggestions: DOCUMENT_CLASSES
          .filter((c: string) => c.toLowerCase().startsWith(typed))
          .map((c: string) => ({
              label: c, filterText: c, insertText: c,
              kind: CIK.Class, detail: "document class",
              range, sortText: c,
            })),
        };
      }

      // ── Context: command after \ ─────────────────────────────────────────
      // Only trigger when the char just before the typed word is `\`
      const wordInfo = model.getWordUntilPosition(position);
      const wordStart = wordInfo.startColumn; // 1-indexed
      const charBeforeWord = lineText[wordStart - 2]; // 0-indexed char before word
      if (charBeforeWord !== "\\" && wordInfo.word === "") return { suggestions: [] };

      const prefix = wordInfo.word.toLowerCase();
      const range = {
        startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
        startColumn: wordInfo.startColumn, endColumn: wordInfo.endColumn,
      };

      // Parse user-defined commands from this document
      const docCmds = parseDocumentCommands(model.getValue()).filter((c: ParsedCommand) => !c.isEnv);

      // Build user-command suggestions (show first)
      const userSuggestions = docCmds
        .filter((c: ParsedCommand) => c.name.toLowerCase().startsWith(prefix))
        .map((c: ParsedCommand) => ({
          label:           `\\${c.name}`,
          filterText:      c.name,
          kind:            CIK.Function,
          detail:          `user-defined (${c.argCount} arg${c.argCount !== 1 ? "s" : ""})`,
          insertText:      buildInsertText(c.name, c.argCount),
          insertTextRules: c.argCount > 0 ? CITR : 0,
          range,
          sortText:        `0${c.name}`,  // sort user commands first
        }));

      // Build curated command suggestions
      const curatedSuggestions = LATEX_COMMANDS
        .filter((cmd: LatexCompletion) => cmd.filterText.toLowerCase().startsWith(prefix))
        .map((cmd: LatexCompletion, i: number) => ({
          label:           cmd.label,
          filterText:      cmd.filterText,
          kind:            kindMap[cmd.kind] ?? CIK.Function,
          detail:          cmd.detail,
          documentation:   cmd.documentation ? { value: cmd.documentation, isTrusted: true } : undefined,
          insertText:      cmd.insertText,
          insertTextRules: cmd.insertText.includes("$") ? CITR : 0,
          range,
          sortText:        cmd.sortText ?? `1${cmd.filterText}${String(i).padStart(4, "0")}`,
        }));

      return { suggestions: [...userSuggestions, ...curatedSuggestions] };
    },
  });

  // ── TexLab hover (documentation on hover) ────────────────────────────────
  monaco.languages.registerHoverProvider("latex", {
    provideHover: async (_model: any, position: any) => {
      const client = getLsp();
      const m = getModel();
      if (!client || !m) return null;
      try {
        // Only use TexLab for hover (no completions from TexLab)
        const uri = m.uri?.toString?.() ?? "";
        if (!uri.startsWith("file://")) return null;
        const result = await client.sendRequest("textDocument/hover", {
          textDocument: { uri },
          position: { line: position.lineNumber - 1, character: position.column - 1 },
        });
        if (!result?.contents) return null;
        const raw = result.contents;
        let markdown = "";
        if (typeof raw === "string") markdown = raw;
        else if (Array.isArray(raw)) markdown = raw.map((c: any) => typeof c === "string" ? c : (c.value ?? "")).filter(Boolean).join("\n\n");
        else markdown = String(raw.value ?? "");
        if (!markdown.trim()) return null;
        return { contents: [{ value: markdown, isTrusted: true }] };
      } catch { return null; }
    },
  });
}

// ── TexLab LSP Client (diagnostics + hover only) ──────────────────────────────
class LspClient {
  private ws: WebSocket | null = null;
  private msgId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private queue: object[] = [];
  private initialized = false;

  connect(project: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try { this.ws = new WebSocket("ws://localhost:3100"); } catch (e) { return reject(e); }

      this.ws.onopen = async () => {
        try {
          await this._req("initialize", {
            processId: null,
            clientInfo: { name: "open-overleaf", version: "0.1.0" },
            capabilities: {
              textDocument: {
                hover: { contentFormat: ["markdown", "plaintext"] },
                publishDiagnostics: {
                  versionSupport: true,
                  tagSupport: { valueSet: [1, 2] },
                },
                synchronization: { didSave: true },
              },
              workspace: { workspaceFolders: true },
            },
            rootUri: `file:///workspace/${project}`,
            workspaceFolders: [{ uri: `file:///workspace/${project}`, name: project }],
          });
          this._notify("initialized", {});
          this._notify("workspace/didChangeConfiguration", {
            settings: {
              texlab: {
                diagnostics: { delay: 500 },
                chktex: { onOpenAndSave: true, onEdit: false },
              },
            },
          });
          this.initialized = true;
          for (const msg of this.queue) this._send(msg);
          this.queue = [];
          resolve();
        } catch (e) { reject(e); }
      };

      this.ws.onerror = () => {
        console.warn("[lsp] WebSocket error — diagnostics unavailable (is texlab-bridge running on port 3100?)");
        reject(new Error("WebSocket error"));
      };
      this.ws.onclose = () => { this.ws = null; };

      this.ws.onmessage = (event) => {
        let msg: any;
        try { msg = JSON.parse(event.data as string); } catch { return; }
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || "LSP error"));
          else resolve(msg.result);
        } else if (msg.method === "textDocument/publishDiagnostics") {
          // Route to the registered handler for this URI
          if (typeof window !== "undefined") {
            const handler = (window as any).__ooDiagHandlers?.get(msg.params?.uri);
            handler?.(msg.params);
          }
        }
      };
    });
  }

  private _send(msg: object) {
    const str = JSON.stringify(msg);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(str);
    else if (!this.initialized) this.queue.push(msg);
  }

  private _req(method: string, params: any): Promise<any> {
    return this.sendRequest(method, params);
  }

  private _notify(method: string, params: any) {
    this._send({ jsonrpc: "2.0", method, params });
  }

  sendRequest(method: string, params: any): Promise<any> {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this._send({ jsonrpc: "2.0", id, method, params });
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`LSP timeout: ${method}`)); }
      }, 8000);
    });
  }

  sendNotification(method: string, params: any) { this._notify(method, params); }

  isConnected() {
    return this.ws !== null &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING);
  }
}

// ── Window-based singleton (survives HMR + React StrictMode) ─────────────────
function getWindowLsp(): LspClient | null {
  return (typeof window !== "undefined") ? (window as any).__ooLspClient ?? null : null;
}
function setWindowLsp(c: LspClient | null) {
  if (typeof window !== "undefined") (window as any).__ooLspClient = c;
}

function getOrConnectLsp(project: string): Promise<LspClient | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const existing = getWindowLsp();
  if (existing?.isConnected()) return Promise.resolve(existing);
  // Already connecting → share the same promise
  if ((window as any).__ooLspPromise) return (window as any).__ooLspPromise;

  const promise: Promise<LspClient | null> = (async () => {
    try {
      const client = new LspClient();
      await client.connect(project);
      setWindowLsp(client);
      return client;
    } catch {
      setWindowLsp(null);
      return null;
    } finally {
      delete (window as any).__ooLspPromise;
    }
  })();
  (window as any).__ooLspPromise = promise;
  return promise;
}

// ── Editor component ──────────────────────────────────────────────────────────
type EditorProps = {
  content: string;
  onSave: (newContent: string) => Promise<void>;
  filename?: string;
  project?: string;
  filePath?: string;
};

export default function Editor({ content: initial, onSave, filename, project, filePath }: EditorProps) {
  const [value, setValue] = useState(initial || "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lspStatus, setLspStatus] = useState<"connecting" | "connected" | "offline">("offline");

  const editorRef  = useRef<any>(null);
  const monacoRef  = useRef<any>(null);
  const lspRef     = useRef<LspClient | null>(null);
  const docVersion = useRef(0);
  const themeObsRef = useRef<MutationObserver | null>(null);

  const language = getLanguage(filename);

  // Reset content when file changes
  useEffect(() => {
    setValue(initial || "");
    setDirty(false);
    docVersion.current = 0;
  }, [initial, filename]);

  // ── TexLab connection for diagnostics ─────────────────────────────────────
  useEffect(() => {
    if (language !== "latex" && language !== "bibtex") return;
    if (!filePath || !project) return;

    let cancelled = false;
    setLspStatus("connecting");
    const uri = fileUri(project, filePath);

    // Register per-file diagnostic handler (routes by URI)
    if (typeof window !== "undefined") {
      if (!(window as any).__ooDiagHandlers) (window as any).__ooDiagHandlers = new Map();
      (window as any).__ooDiagHandlers.set(uri, (params: any) => {
        if (cancelled || !monacoRef.current || !editorRef.current) return;
        const model = editorRef.current.getModel();
        if (!model || params.uri !== uri) return;
        const markers = (params.diagnostics || []).map((d: any) => ({
          message:         d.message,
          severity:        d.severity === 1 ? monacoRef.current.MarkerSeverity.Error
                         : d.severity === 2 ? monacoRef.current.MarkerSeverity.Warning
                         :                    monacoRef.current.MarkerSeverity.Information,
          startLineNumber: (d.range?.start?.line ?? 0) + 1,
          startColumn:     (d.range?.start?.character ?? 0) + 1,
          endLineNumber:   (d.range?.end?.line ?? 0) + 1,
          endColumn:       (d.range?.end?.character ?? 0) + 1,
          source: "texlab",
        }));
        monacoRef.current.editor.setModelMarkers(model, "texlab", markers);
      });
    }

    getOrConnectLsp(project).then((client) => {
      if (cancelled || !client) {
        if (!cancelled) setLspStatus("offline");
        return;
      }
      lspRef.current = client;
      setLspStatus("connected");
      client.sendNotification("textDocument/didOpen", {
        textDocument: { uri, languageId: language, version: ++docVersion.current, text: initial || "" },
      });
    });

    return () => {
      cancelled = true;
      (window as any).__ooDiagHandlers?.delete(uri);
      // Clear markers when leaving this file
      if (monacoRef.current && editorRef.current) {
        const model = editorRef.current.getModel();
        if (model) monacoRef.current.editor.setModelMarkers(model, "texlab", []);
      }
      if (lspRef.current) {
        lspRef.current.sendNotification("textDocument/didClose", { textDocument: { uri } });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, filePath, project, initial]);

  // ── Change & save ─────────────────────────────────────────────────────────
  const handleChange = useCallback((v: string | undefined) => {
    const newVal = v || "";
    setValue(newVal);
    setDirty(newVal !== initial);
    if (lspRef.current && filePath && project) {
      lspRef.current.sendNotification("textDocument/didChange", {
        textDocument: { uri: fileUri(project, filePath), version: ++docVersion.current },
        contentChanges: [{ text: newVal }],
      });
    }
  }, [initial, filePath, project]);

  const handleSave = useCallback(async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSave(value);
      setDirty(false);
      if (lspRef.current && filePath && project) {
        lspRef.current.sendNotification("textDocument/didSave", {
          textDocument: { uri: fileUri(project, filePath) },
        });
      }
    } finally { setSaving(false); }
  }, [dirty, saving, value, onSave, filePath, project]);

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

    // Register providers once — completions are purely built-in (no TexLab)
    registerProvidersOnce(
      monaco,
      () => editorRef.current?.getModel(),
      () => lspRef.current,
    );

    // Auto-trigger suggestions on `\`
    editor.onDidChangeModelContent((e: any) => {
      const last = e.changes?.[e.changes.length - 1];
      if (last?.text === "\\") {
        setTimeout(() => editor.trigger("latex", "editor.action.triggerSuggest", {}), 50);
      }
    });

    // Theme sync
    const applyTheme = () => monaco.editor.setTheme(getMonacoTheme());
    applyTheme();
    const obs = new MutationObserver(applyTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    themeObsRef.current = obs;
    editor.onDidDispose(() => obs.disconnect());
  }, []); // empty deps — reads state via refs

  // ── Render ────────────────────────────────────────────────────────────────
  const lspDot =
    lspStatus === "connected"  ? <span title="TexLab diagnostics active" style={{ color: "var(--ink-success)", fontSize: 9 }}>● LSP</span>
  : lspStatus === "connecting" ? <span title="Connecting to TexLab…"     style={{ color: "var(--lamp)",        fontSize: 9 }}>◌ LSP</span>
  : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
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

      <div style={{ flex: 1, minHeight: 0 }}>
        <EditorMono
          height="100%"
          language={language}
          value={value}
          onChange={handleChange}
          onMount={handleEditorMount}
          theme="oo-dark"
          options={{
            minimap:                    { enabled: false },
            fontSize:                   13,
            fontFamily:                 "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            fontLigatures:              true,
            lineHeight:                 22,
            padding:                    { top: 16, bottom: 16 },
            renderLineHighlight:        "gutter",
            scrollBeyondLastLine:       false,
            wordWrap:                   "on",
            wrappingIndent:             "same",
            smoothScrolling:            true,
            cursorBlinking:             "smooth",
            cursorSmoothCaretAnimation: "on",
            tabSize:                    2,
            renderWhitespace:           "none",
            overviewRulerLanes:         1,
            guides:                     { bracketPairs: true, indentation: true },
            suggestOnTriggerCharacters: true,
            quickSuggestions:           { other: true, comments: false, strings: false },
            acceptSuggestionOnEnter:    "on",
            snippetSuggestions:         "top",
            suggest: {
              showSnippets:    true,
              filterGraceful:  false,   // strict prefix matching — no fuzzy
              localityBonus:   true,
              showWords:       false,   // no built-in word completion noise
            },
          }}
        />
      </div>
    </div>
  );
}
