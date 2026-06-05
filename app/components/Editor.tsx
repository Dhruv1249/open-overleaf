"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import EditorMono from "@monaco-editor/react";

type EditorProps = {
  content: string;
  onSave: (newContent: string) => Promise<void>;
  filename?: string;
};

export default function Editor({ content: initial, onSave, filename }: EditorProps) {
  const [value, setValue] = useState(initial || "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<any>(null);

  useEffect(() => {
    setValue(initial || "");
    setDirty(false);
  }, [initial]);

  const handleChange = (v: string | undefined) => {
    setValue(v || "");
    setDirty(v !== initial);
  };

  const handleSave = useCallback(async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSave(value);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [dirty, saving, value, onSave]);

  // Cmd/Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Editor toolbar */}
      <div className="editor-toolbar" style={{ height: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {filename && (
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--quill-secondary)",
              letterSpacing: "0.01em"
            }}>
              {filename}
            </span>
          )}
          {dirty && (
            <span className="chip chip-warn" style={{ fontSize: 10 }}>
              unsaved
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "var(--quill-muted)", fontFamily: "var(--font-mono)" }}>
            ⌘S to save
          </span>
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

      {/* Monaco Editor */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <EditorMono
          height="100%"
          defaultLanguage="latex"
          value={value}
          onChange={handleChange}
          onMount={(editor) => {
            editorRef.current = editor;
          }}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
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
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            guides: { bracketPairs: false, indentation: false },
          }}
        />
      </div>
    </div>
  );
}
