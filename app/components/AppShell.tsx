"use client";

import { useState, useCallback } from "react";
import ThemeToggle from "./ThemeToggle";
import UserStatus from "./UserStatus";
import ProjectsList from "./ProjectsList";
import ProjectTree from "./ProjectTree";
import Editor from "./Editor";

type SaveState = "idle" | "saving" | "saved" | "error";

// ── PDF placeholder ───────────────────────────────────────────────────────────
function PdfPanel({ fileOpen }: { fileOpen: boolean }) {
  return (
    <aside className="preview-panel" aria-label="PDF preview">
      <div className="panel-header">
        <span className="panel-header-label">PDF Preview</span>
        <span className="chip chip-neutral" style={{ fontSize: 10, padding: "1px 6px" }}>SyncTeX</span>
      </div>

      {fileOpen ? (
        <div className="preview-viewport">
          <div className="pdf-page">
            <div className="pdf-page-inner" style={{ gap: 8 }}>
              <div className="pdf-line title" />
              <div className="pdf-line subtitle" />
              <div style={{ height: 10 }} />
              {[100, 100, 80, 100, 90, 100, 100, 70, 100, 100, 85, 100, 60].map((w, i) => (
                <div key={i} className="pdf-line body" style={{ width: `${w}%`, marginTop: 2 }} />
              ))}
              <div style={{ height: 8 }} />
              <div className="pdf-line" style={{ width: "45%", height: 2.5, opacity: 0.7 }} />
              <div style={{ height: 4 }} />
              {[100, 100, 90, 75].map((w, i) => (
                <div key={`b-${i}`} className="pdf-line body" style={{ width: `${w}%`, marginTop: 2 }} />
              ))}
            </div>
          </div>
          <div style={{ fontSize: 10, color: "var(--quill-muted)", fontFamily: "var(--font-mono)", textAlign: "center" }}>
            Page 1 · Awaiting compile
          </div>
        </div>
      ) : (
        <div className="preview-placeholder">
          <div style={{
            width: "100%", maxWidth: 200, aspectRatio: "210/297",
            background: "#f8f5ee", borderRadius: "var(--r-xs)",
            border: "1px solid var(--rule-soft)", boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
            display: "flex", flexDirection: "column", padding: 18, gap: 7, flexShrink: 0,
          }}>
            <div style={{ height: 3, width: "62%", background: "#2a2520", borderRadius: 1 }} />
            <div style={{ height: 2, width: "44%", background: "#2a2520", borderRadius: 1, opacity: 0.5 }} />
            <div style={{ height: 10 }} />
            {[100, 100, 80, 100, 90, 100, 65].map((w, i) => (
              <div key={i} style={{ height: 1.5, width: `${w}%`, background: "#2a2520", borderRadius: 1, opacity: 0.35, marginTop: 2 }} />
            ))}
          </div>
          <p className="preview-placeholder-text" style={{ maxWidth: 160 }}>
            Compile a .tex file to render the PDF here.
          </p>
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--rule-soft)", flexShrink: 0 }}>
        <div className="info-row"><span className="info-label">Compiler</span><span className="info-value">xelatex</span></div>
        <div className="info-row"><span className="info-label">Bibliography</span><span className="info-value">biber</span></div>
        <div className="info-row"><span className="info-label">Debounce</span><span className="info-value">2 000 ms</span></div>
        <div className="info-row" style={{ borderBottom: "none" }}><span className="info-label">Backup</span><span className="info-value">Google Drive</span></div>
      </div>
    </aside>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────────────
export default function AppShell() {
  const [project, setProject] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // ── Select a project ──────────────────────────────────────────────────────
  const handleSelectProject = useCallback((name: string) => {
    setProject(name);
    setSelectedFile(null);
    setFileContent("");
    setSaveState("idle");
  }, []);

  // ── Open a file ───────────────────────────────────────────────────────────
  const handleSelectFile = useCallback(async (path: string) => {
    if (!project) return;
    // Ignore directory clicks that bubble up
    setSelectedFile(path);
    setFileLoading(true);
    setFileContent("");
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(project)}/file?path=${encodeURIComponent(path)}`
      );
      const data = await res.json();
      // 404 means the file is new/empty — open a blank editor
      if (data.ok) {
        setFileContent(data.content ?? "");
      } else if (res.status === 404 || data.error === "not found") {
        setFileContent(""); // empty file — ready to type
      } else {
        console.error("File load error:", data.error);
        setFileContent("");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setFileLoading(false);
    }
  }, [project]);

  // ── Save a file ───────────────────────────────────────────────────────────
  const handleSaveFile = useCallback(async (newContent: string) => {
    if (!project || !selectedFile) return;
    setSaveState("saving");
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project)}/file`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: selectedFile,
          content: newContent,
          message: `Edit ${selectedFile}`,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setFileContent(newContent);
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 2000);
      } else {
        setSaveState("error");
        setTimeout(() => setSaveState("idle"), 3000);
      }
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  }, [project, selectedFile]);

  const filename = selectedFile ? selectedFile.split("/").pop() : undefined;

  return (
    <div className="app-shell">
      {/* ── Titlebar ── */}
      <header className="app-titlebar">
        {/* Wordmark */}
        <div className="wordmark">
          <div className="wordmark-logo">Ω</div>
          <div className="wordmark-text">Open Overleaf</div>
          <span className="wordmark-tag" style={{ marginLeft: 4 }}>GitHub-backed LaTeX</span>
        </div>

        {/* Breadcrumb */}
        <div className="titlebar-center">
          <nav className="breadcrumb" aria-label="Navigation">
            {project ? (
              <>
                <button
                  onClick={() => { setProject(null); setSelectedFile(null); }}
                  style={{
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                    color: "var(--quill-tertiary)", fontSize: 12,
                  }}
                >
                  Projects
                </button>
                <span className="breadcrumb-sep">/</span>
                <span className={selectedFile ? "" : "breadcrumb-active"}>{project}</span>
                {selectedFile && (
                  <>
                    <span className="breadcrumb-sep">/</span>
                    <span className="breadcrumb-active mono" style={{ fontSize: 11 }}>
                      {selectedFile.replace(/\//g, " / ")}
                    </span>
                  </>
                )}
              </>
            ) : (
              <span>Projects</span>
            )}
          </nav>
        </div>

        {/* Controls */}
        <div className="titlebar-right">
          <ThemeToggle />
          <UserStatus />
        </div>
      </header>

      {/* ── Body ── */}
      <div className="app-body">

        {/* ── Left rail ── */}
        <aside className="rail-panel" aria-label="File explorer">
          {project ? (
            // File tree for current project
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div className="panel-header">
                <button
                  className="btn-sm btn-ghost"
                  onClick={() => { setProject(null); setSelectedFile(null); }}
                  style={{ fontSize: 11, gap: 4 }}
                >
                  ← Projects
                </button>
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: "var(--quill-secondary)",
                  fontFamily: "var(--font-mono)",
                  maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {project}
                </span>
              </div>
              <div className="panel-scroll" style={{ flex: 1 }}>
                <ProjectTree
                  project={project}
                  selectedFile={selectedFile}
                  onSelect={handleSelectFile}
                />
              </div>
            </div>
          ) : (
            // Project list
            <ProjectsList onSelect={handleSelectProject} />
          )}
        </aside>

        {/* ── Editor ── */}
        <main className="editor-panel" aria-label="Code editor">
          {fileLoading ? (
            <div className="editor-empty" style={{ flex: 1 }}>
              <span className="serif editor-empty-glyph loading-pulse" style={{ fontSize: 48 }}>…</span>
              <p className="editor-empty-label">Loading file</p>
            </div>
          ) : selectedFile ? (
            <Editor
              content={fileContent}
              onSave={handleSaveFile}
              filename={filename}
              project={project ?? undefined}
              filePath={selectedFile ?? undefined}
            />
          ) : (
            <div className="editor-empty" style={{ flex: 1 }}>
              <span className="serif editor-empty-glyph" style={{ fontSize: 64, color: "var(--rule-emphasis)", fontStyle: "italic" }}>
                {project ? "λ" : "Ω"}
              </span>
              <p className="editor-empty-label" style={{ maxWidth: 260 }}>
                {project
                  ? "Select a file from the explorer to start editing."
                  : "Select a project from the left panel. Connect GitHub first to load repositories."}
              </p>
              {!project && (
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", justifyContent: "center" }}>
                  <span className="chip chip-neutral">Monaco</span>
                  <span className="chip chip-neutral">SyncTeX</span>
                  <span className="chip chip-neutral">TexLab LSP</span>
                  <span className="chip chip-neutral">PDF preview</span>
                </div>
              )}
            </div>
          )}

          {/* Status bar */}
          <div className="status-bar">
            <div className="status-left">
              <span className="status-item mono">
                {selectedFile ? selectedFile : "Open Overleaf v0.1"}
              </span>
            </div>
            <div className="status-right">
              <span className="status-item" style={{
                color: saveState === "saved" ? "var(--ink-success)"
                  : saveState === "saving" ? "var(--lamp)"
                  : saveState === "error" ? "var(--ink-danger)"
                  : "var(--quill-muted)"
              }}>
                {saveState === "saving" ? "⟳ Saving…"
                  : saveState === "saved" ? "✓ Saved to GitHub"
                  : saveState === "error" ? "✗ Save failed"
                  : "xelatex · biber"}
              </span>
              <span className="status-item">UTF-8</span>
            </div>
          </div>
        </main>

        {/* ── PDF Preview ── */}
        <PdfPanel fileOpen={!!selectedFile} />
      </div>
    </div>
  );
}
