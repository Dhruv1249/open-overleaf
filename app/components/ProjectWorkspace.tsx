"use client";

import { useState, useCallback } from "react";
import ProjectTree from "./ProjectTree";
import Editor from "./Editor";

type SaveState = "idle" | "saving" | "saved" | "error";

// Simulated PDF preview placeholder — rendered as typeset page
function PdfPreview({ filename }: { filename: string | null }) {
  if (!filename) {
    return (
      <div className="preview-placeholder">
        <span className="serif" style={{ fontSize: 36, color: "var(--rule-emphasis)", fontStyle: "italic" }}>∅</span>
        <p className="preview-placeholder-text">
          Select a .tex file to see the compiled PDF preview here.
        </p>
      </div>
    );
  }

  return (
    <div className="preview-viewport">
      {/* Mock PDF page */}
      <div className="pdf-page">
        <div className="pdf-page-inner" style={{ gap: 10 }}>
          {/* Title block */}
          <div className="pdf-line title" />
          <div className="pdf-line subtitle" />
          <div style={{ height: 12 }} />
          {/* Body paragraphs */}
          {[100, 100, 80, 100, 90, 100, 100, 70, 100, 100, 85, 100, 100, 60].map((w, i) => (
            <div
              key={i}
              className="pdf-line body"
              style={{ width: `${w}%`, marginTop: i === 6 ? 8 : 2 }}
            />
          ))}
          {/* Section heading */}
          <div style={{ height: 8 }} />
          <div className="pdf-line" style={{ width: "45%", height: 2.5, opacity: 0.7 }} />
          <div style={{ height: 4 }} />
          {[100, 100, 90, 100, 100, 75].map((w, i) => (
            <div
              key={`b2-${i}`}
              className="pdf-line body"
              style={{ width: `${w}%`, marginTop: 2 }}
            />
          ))}
        </div>
      </div>

      {/* Page number */}
      <div style={{
        fontSize: 10,
        color: "var(--quill-muted)",
        fontFamily: "var(--font-mono)",
        textAlign: "center"
      }}>
        Page 1 · Awaiting compile
      </div>
    </div>
  );
}

export default function ProjectWorkspace({ project }: { project: string }) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errors, setErrors] = useState(0);
  const [warnings, setWarnings] = useState(1);

  const loadFile = async (path: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(project)}/file?path=${encodeURIComponent(path)}`
      );
      const data = await res.json();
      if (data.ok) {
        setSelectedFile(path);
        setContent(data.content);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const saveFile = useCallback(async (newContent: string) => {
    if (!selectedFile) return;
    setSaveState("saving");
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(project)}/file`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: selectedFile,
            content: newContent,
            message: `Edit ${selectedFile}`,
          }),
        }
      );
      const data = await res.json();
      if (data.ok) {
        setContent(newContent);
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 2000);
      } else {
        console.error(data.error);
        setSaveState("error");
        setTimeout(() => setSaveState("idle"), 3000);
      }
    } catch (e) {
      console.error(e);
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  }, [selectedFile, project]);

  const filename = selectedFile ? selectedFile.split("/").pop() : null;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "200px 1fr 260px",
      gridTemplateRows: "1fr 26px",
      height: "100%",
      overflow: "hidden",
      minHeight: 0
    }}>
      {/* ── File tree panel ── */}
      <div style={{
        gridColumn: 1,
        gridRow: "1 / 3",
        borderRight: "1px solid var(--rule-standard)",
        background: "var(--ink-raised)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}>
        <div className="panel-header">
          <span className="panel-header-label">Files</span>
          <span style={{ fontSize: 10, color: "var(--quill-muted)", fontFamily: "var(--font-mono)" }}>
            {project}
          </span>
        </div>
        <div className="panel-scroll">
          <ProjectTree
            project={project}
            onSelect={loadFile}
            selectedFile={selectedFile}
          />
        </div>
      </div>

      {/* ── Editor ── */}
      <div style={{
        gridColumn: 2,
        gridRow: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minHeight: 0,
        background: "var(--ink-base)"
      }}>
        {loading ? (
          <div className="editor-empty">
            <span className="serif editor-empty-glyph loading-pulse">…</span>
            <p className="editor-empty-label">Loading file</p>
          </div>
        ) : selectedFile ? (
          <Editor content={content} onSave={saveFile} filename={filename ?? undefined} />
        ) : (
          <div className="editor-empty">
            <span className="serif editor-empty-glyph">λ</span>
            <p className="editor-empty-label">
              Select a file from the composition rail to begin editing
            </p>
          </div>
        )}
      </div>

      {/* ── PDF Preview ── */}
      <div style={{
        gridColumn: 3,
        gridRow: "1 / 3",
        borderLeft: "1px solid var(--rule-standard)",
        background: "var(--ink-base)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}>
        <div className="panel-header">
          <span className="panel-header-label">Preview</span>
          <span className="chip chip-neutral" style={{ fontSize: 10, padding: "1px 6px" }}>
            xelatex
          </span>
        </div>
        <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
          <PdfPreview filename={selectedFile} />
        </div>

        {/* Diagnostics */}
        <div style={{ borderTop: "1px solid var(--rule-soft)", flexShrink: 0 }}>
          <div className="info-row">
            <span className="info-label">Errors</span>
            <span className="info-value" style={{ color: errors > 0 ? "var(--ink-danger)" : "var(--ink-success)" }}>
              {errors}
            </span>
          </div>
          <div className="info-row" style={{ borderBottom: "none" }}>
            <span className="info-label">Warnings</span>
            <span className="info-value" style={{ color: warnings > 0 ? "var(--ink-warn)" : "var(--quill-muted)" }}>
              {warnings}
            </span>
          </div>
        </div>
      </div>

      {/* ── Status bar ── */}
      <div style={{
        gridColumn: 2,
        gridRow: 2,
        borderTop: "1px solid var(--rule-standard)",
        background: "var(--ink-raised)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        fontSize: 10,
        color: "var(--quill-muted)",
        fontFamily: "var(--font-mono)",
        flexShrink: 0
      }}>
        <span>
          {selectedFile ? `§ ${selectedFile}` : "No file selected"}
        </span>
        <span style={{
          color: saveState === "saved"
            ? "var(--ink-success)"
            : saveState === "saving"
            ? "var(--lamp)"
            : saveState === "error"
            ? "var(--ink-danger)"
            : "var(--quill-muted)"
        }}>
          {saveState === "saving" ? "⟳ Saving…"
            : saveState === "saved" ? "✓ Saved"
            : saveState === "error" ? "✗ Save failed"
            : "Auto-compile: 2s"}
        </span>
      </div>
    </div>
  );
}
