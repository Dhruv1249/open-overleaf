"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import ThemeToggle from "./ThemeToggle";
import UserStatus from "./UserStatus";
import ProjectsList from "./ProjectsList";
import ProjectTree from "./ProjectTree";
import Editor from "./Editor";

// ── Drag handle between panels ────────────────────────────────────────────────
function DragHandle({ onDrag }: { onDrag: (dx: number) => void }) {
  const [active, setActive] = useState(false);
  const lastX = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    lastX.current = e.clientX;
    setActive(true);

    // ── Transparent overlay: sits above iframes so mouse events stay in main document ──
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:99999;cursor:col-resize;background:transparent;";
    document.body.appendChild(overlay);
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - lastX.current;
      lastX.current = ev.clientX;
      onDrag(dx);
    };
    const onUp = () => {
      setActive(false);
      overlay.remove();
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  }, [onDrag]);

  return (
    <div
      className={`drag-handle${active ? " drag-active" : ""}`}
      onMouseDown={onMouseDown}
    />
  );
}

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

type SaveState    = "idle" | "saving" | "saved" | "error";
type CompileState = "idle" | "syncing" | "compiling" | "success" | "error";

const RAIL_KEY    = "oo-rail-width";
const PREVIEW_KEY = "oo-preview-width";


// ── PDF Preview panel ─────────────────────────────────────────────────────────
function PdfPanel({
  project,
  mainFile,
  pdfKey,
  compileState,
  compileLog,
  errorCount,
  warningCount,
  onManualCompile,
  onDownload,
  width,
}: {
  project: string | null;
  mainFile: string | null;
  pdfKey: number;
  compileState: CompileState;
  compileLog: string;
  errorCount: number;
  warningCount: number;
  onManualCompile: () => void;
  onDownload: () => void;
  width: number;
}) {
  const pdfSrc = project && mainFile && pdfKey > 0
    ? `/api/projects/${encodeURIComponent(project)}/pdf?mainFile=${encodeURIComponent(mainFile)}&t=${pdfKey}`
    : null;

  const spinning = compileState === "syncing" || compileState === "compiling";

  return (
    <aside className="preview-panel" aria-label="PDF preview" style={{ width, flexShrink: 0 }}>
      {/* Header */}
      <div className="panel-header" style={{ gap: 6, flexWrap: "nowrap" }}>
        <span className="panel-header-label">PDF Preview</span>

        {/* Compile status pill */}
        <span style={{
          fontSize: 11, fontFamily: "var(--font-mono)", padding: "1px 6px",
          borderRadius: 4,
          background:
            compileState === "success" ? "rgba(100,200,100,0.15)"
          : compileState === "error"   ? "rgba(200,80,80,0.18)"
          : "rgba(200,169,110,0.13)",
          color:
            compileState === "success" ? "var(--ink-success)"
          : compileState === "error"   ? "var(--ink-danger)"
          : "var(--lamp)",
        }}>
          {spinning ? "⟳ compiling…"
           : compileState === "success" ? `✓ ok · ${errorCount}e ${warningCount}w`
           : compileState === "error"   ? `✗ ${errorCount} error${errorCount !== 1 ? "s" : ""}`
           : "auto"}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          {/* Manual compile */}
          <button
            className="btn-sm btn-ghost"
            onClick={onManualCompile}
            disabled={!project || !mainFile || spinning}
            title="Force recompile now"
            style={{ fontSize: 13 }}
          >
            ⟳
          </button>
          {/* Download */}
          <button
            className="btn-sm btn-ghost"
            onClick={onDownload}
            disabled={!pdfSrc}
            title="Download PDF"
            style={{ fontSize: 13 }}
          >
            ↓ PDF
          </button>
        </div>
      </div>

      {/* Main area: PDF or placeholder */}
      <div style={{ flex: 1, position: "relative", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* PDF iframe — always mounted once we have one, so it doesn't flicker */}
        {pdfKey > 0 && pdfSrc ? (
          <iframe
            key={pdfKey}
            src={pdfSrc}
            style={{ width: "100%", flex: 1, border: "none", display: "block", minHeight: 0 }}
            title="PDF Preview"
          />
        ) : (
          <div className="preview-placeholder" style={{ flex: 1 }}>
            <div style={{
              width: "100%", maxWidth: 180, aspectRatio: "210/297",
              background: "#f8f5ee", borderRadius: "var(--r-xs)",
              border: "1px solid var(--rule-soft)", boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
              display: "flex", flexDirection: "column", padding: 16, gap: 6, flexShrink: 0,
            }}>
              {[62, 44, 0, 100, 100, 80, 100, 90, 100, 65].map((w, i) =>
                w === 0 ? <div key={i} style={{ height: 8 }} /> :
                <div key={i} style={{ height: i < 2 ? (i === 0 ? 3 : 2) : 1.5, width: `${w}%`, background: "#2a2520", borderRadius: 1, opacity: i < 2 ? (i === 1 ? 0.5 : 1) : 0.35, marginTop: 2 }} />
              )}
            </div>
            <p className="preview-placeholder-text" style={{ maxWidth: 180, marginTop: 12 }}>
              {project && mainFile
                ? `Editing ${mainFile} — PDF updates 2s after you stop typing.`
                : "Open a .tex file to start auto-compiling."}
            </p>
          </div>
        )}

        {/* Spinning overlay while compiling */}
        {spinning && (
          <div style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.28)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 10, backdropFilter: "blur(1px)", zIndex: 10, pointerEvents: "none",
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              border: "3px solid rgba(200,169,110,0.25)",
              borderTopColor: "var(--lamp)",
              animation: "spin 0.7s linear infinite",
            }} />
            <span style={{ fontSize: 14, color: "#fff", fontFamily: "var(--font-mono)" }}>
              {compileState === "syncing" ? "Syncing…" : "Compiling…"}
            </span>
          </div>
        )}
      </div>

      {/* Error/Log panel — shown automatically on error, no button click needed */}
      {compileState === "error" && compileLog && (
        <div style={{
          borderTop: "2px solid var(--ink-danger)",
          background: "rgba(180,40,40,0.07)",
          flexShrink: 0,
          maxHeight: 220,
          display: "flex",
          flexDirection: "column",
        }}>
          <div style={{
            padding: "5px 10px",
            borderBottom: "1px solid rgba(180,40,40,0.2)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-danger)" }}>
              ✗ Compile errors
            </span>
            <span style={{ fontSize: 11, color: "var(--quill-muted)", fontFamily: "var(--font-mono)" }}>
              scroll to see full log
            </span>
          </div>
          <pre style={{
            flex: 1, overflow: "auto", margin: 0, padding: "8px 10px",
            fontSize: 11, lineHeight: 1.6,
            fontFamily: "var(--font-mono)", color: "#f87171",
            whiteSpace: "pre-wrap", wordBreak: "break-all",
          }}>
            {compileLog}
          </pre>
        </div>
      )}

      {/* Warning log — collapsed, shown on success if warnings > 0 */}
      {compileState === "success" && warningCount > 0 && (
        <details style={{ borderTop: "1px solid var(--rule-soft)", flexShrink: 0, background: "var(--ink-raised)" }}>
          <summary style={{ padding: "4px 10px", fontSize: 11, cursor: "pointer", color: "var(--lamp)" }}>
            {warningCount} warning{warningCount !== 1 ? "s" : ""} — click to expand
          </summary>
          <pre style={{
            margin: 0, padding: "6px 10px", maxHeight: 120, overflow: "auto",
            fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--lamp)",
            whiteSpace: "pre-wrap", wordBreak: "break-all",
          }}>
            {compileLog.split("\n").filter((l: string) => l.toLowerCase().includes("warning")).join("\n")}
          </pre>
        </details>
      )}

      {/* Footer */}
      <div style={{ borderTop: "1px solid var(--rule-soft)", flexShrink: 0 }}>
        <div className="info-row">
          <span className="info-label">Auto-compile</span>
          <span className="info-value">2s after typing stops</span>
        </div>
        <div className="info-row" style={{ borderBottom: "none" }}>
          <span className="info-label">Engine</span>
          <span className="info-value">pdflatex / xelatex</span>
        </div>
      </div>
    </aside>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────────────
export default function AppShell() {
  const [project,      setProject]      = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent,  setFileContent]  = useState("");
  const [fileLoading,  setFileLoading]  = useState(false);
  const [saveState,    setSaveState]    = useState<SaveState>("idle");

  const [compileState,  setCompileState]  = useState<CompileState>("idle");
  const [compileLog,    setCompileLog]    = useState("");
  const [errorCount,    setErrorCount]    = useState(0);
  const [warningCount,  setWarningCount]  = useState(0);
  const [pdfKey,        setPdfKey]        = useState(0);
  const [mainFile,      setMainFile]      = useState<string | null>(null);

  // Panel widths — start with SSR-safe defaults, sync from localStorage after mount
  const [railWidth,    setRailWidth]    = useState(200);
  const [previewWidth, setPreviewWidth] = useState(280);

  // Read persisted values after hydration (avoids SSR mismatch)
  useEffect(() => {
    const r = Number(localStorage.getItem(RAIL_KEY));
    const p = Number(localStorage.getItem(PREVIEW_KEY));
    if (r > 0) setRailWidth(r);
    if (p > 0) setPreviewWidth(p);
  }, []);

  // Persist on every change
  useEffect(() => { localStorage.setItem(RAIL_KEY,    String(railWidth));    }, [railWidth]);
  useEffect(() => { localStorage.setItem(PREVIEW_KEY, String(previewWidth)); }, [previewWidth]);

  const dragRail    = useCallback((dx: number) => setRailWidth(w    => clamp(w + dx,  80, 900)),  []);
  const dragPreview = useCallback((dx: number) => setPreviewWidth(w => clamp(w - dx, 150, 1100)), []);

  // Refs that survive re-renders for use in callbacks
  const autoCompileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentContent   = useRef<string>("");        // latest editor content (possibly unsaved)
  const currentFile      = useRef<string | null>(null);
  const currentProject   = useRef<string | null>(null);
  const currentMainFile  = useRef<string | null>(null);

  // Keep refs in sync
  useEffect(() => { currentProject.current  = project;  }, [project]);
  useEffect(() => { currentFile.current     = selectedFile; }, [selectedFile]);
  useEffect(() => { currentMainFile.current = mainFile; }, [mainFile]);

  // Reset compile state when project changes
  useEffect(() => {
    setMainFile(null);
    setCompileState("idle");
    setCompileLog("");
    setErrorCount(0);
    setWarningCount(0);
    setPdfKey(0);
    currentContent.current = "";
  }, [project]);

  // ── Core compile function ─────────────────────────────────────────────────
  const compile = useCallback(async (
    projectName: string,
    mf: string,
    overrides: { path: string; content: string }[] = [],
  ) => {
    setCompileState("syncing");
    setCompileLog("");
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectName)}/compile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mainFile: mf, engine: "auto", overrides }),
      });
      const data = await res.json();

      // Always expose the full log — no hiding
      const fullLog = [
        data.log || "",
        data.error && !data.log?.includes(data.error) ? `\n[API error] ${data.error}` : "",
      ].filter(Boolean).join("");
      setCompileLog(fullLog);

      if (data.ok) {
        setCompileState("success");
        setErrorCount(data.errors   ?? 0);
        setWarningCount(data.warnings ?? 0);
        setPdfKey(k => k + 1);
      } else {
        setCompileState("error");
        // errorCount from parsed log; fallback to 1 if API couldn't parse
        setErrorCount(
          Array.isArray(data.errors) ? data.errors.length
          : typeof data.errors === "number" ? data.errors
          : 1
        );
        setWarningCount(0);
      }
    } catch (e: any) {
      setCompileState("error");
      setCompileLog(`Network / server error:\n${e.message}`);
      setErrorCount(1);
    }
  }, []);

  // ── Auto-compile: fires 2s after typing stops ─────────────────────────────
  const scheduleAutoCompile = useCallback(() => {
    if (autoCompileTimer.current) clearTimeout(autoCompileTimer.current);
    autoCompileTimer.current = setTimeout(() => {
      const proj = currentProject.current;
      const file = currentFile.current;   // always compile the file that's open
      if (!proj || !file || !file.endsWith(".tex")) return;
      // Send current unsaved content as an override so we compile what's on screen
      compile(proj, file, [{ path: file, content: currentContent.current }]);
    }, 2000);
  }, [compile]);

  // ── Manual compile (force, no debounce) ──────────────────────────────────
  const handleManualCompile = useCallback(() => {
    if (autoCompileTimer.current) clearTimeout(autoCompileTimer.current);
    const proj = currentProject.current;
    const mf   = currentMainFile.current;
    const file = currentFile.current;
    if (!proj || !mf) return;
    compile(proj, mf, file ? [{ path: file, content: currentContent.current }] : []);
  }, [compile]);

  // ── Content change (every keystroke) ─────────────────────────────────────
  const handleContentChange = useCallback((content: string) => {
    currentContent.current = content;
    scheduleAutoCompile();
  }, [scheduleAutoCompile]);

  // ── Download ──────────────────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    if (!project || !mainFile || pdfKey === 0) return;
    const a = document.createElement("a");
    a.href = `/api/projects/${encodeURIComponent(project)}/pdf?mainFile=${encodeURIComponent(mainFile)}&download=1&t=${pdfKey}`;
    a.download = mainFile.replace(/\.tex$/, ".pdf");
    a.click();
  }, [project, mainFile, pdfKey]);

  // ── Project select ────────────────────────────────────────────────────────
  const handleSelectProject = useCallback((name: string) => {
    setProject(name);
    setSelectedFile(null);
    setFileContent("");
    setSaveState("idle");
  }, []);

  // ── File open ─────────────────────────────────────────────────────────────
  const handleSelectFile = useCallback(async (filePath: string) => {
    if (!project) return;
    // Clear auto-compile timer from previous file
    if (autoCompileTimer.current) clearTimeout(autoCompileTimer.current);

    setSelectedFile(filePath);
    setFileLoading(true);
    setFileContent("");
    currentContent.current = "";

    // Always use the opened .tex file as the compile target
    if (filePath.endsWith(".tex")) {
      setMainFile(filePath);
      currentMainFile.current = filePath;
    }

    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(project)}/file?path=${encodeURIComponent(filePath)}`
      );
      const data = await res.json();
      const content = data.ok ? (data.content ?? "") : "";
      setFileContent(content);
      currentContent.current = content;

      // Auto-compile immediately on file open (if it's a .tex file)
      if (filePath.endsWith(".tex") && project) {
        compile(project, filePath, [{ path: filePath, content }]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setFileLoading(false);
    }
  }, [project, compile]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSaveFile = useCallback(async (newContent: string) => {
    if (!project || !selectedFile) return;
    setSaveState("saving");
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project)}/file`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedFile, content: newContent, message: `Edit ${selectedFile}` }),
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
        <div className="wordmark">
          <div className="wordmark-logo">Ω</div>
          <div className="wordmark-text">Open Overleaf</div>
          <span className="wordmark-tag" style={{ marginLeft: 4 }}>GitHub-backed LaTeX</span>
        </div>

        <div className="titlebar-center">
          <nav className="breadcrumb" aria-label="Navigation">
            {project ? (
              <>
                <button
                  onClick={() => { setProject(null); setSelectedFile(null); }}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--quill-tertiary)", fontSize: 15 }}
                >
                  Projects
                </button>
                <span className="breadcrumb-sep">/</span>
                <span className={selectedFile ? "" : "breadcrumb-active"}>{project}</span>
                {selectedFile && (
                  <>
                    <span className="breadcrumb-sep">/</span>
                    <span className="breadcrumb-active mono" style={{ fontSize: 14 }}>
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

        <div className="titlebar-right">
          <ThemeToggle />
          <UserStatus />
        </div>
      </header>

      {/* ── Body — flex row with drag handles ── */}
      <div
        className="app-body"
        style={{ display: "flex", gridTemplateColumns: undefined }}
      >

        {/* ── Left rail ── */}
        <aside
          className="rail-panel"
          aria-label="File explorer"
          style={{ width: railWidth, flexShrink: 0 }}
        >
          {project ? (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div className="panel-header">
                <button
                  className="btn-sm btn-ghost"
                  onClick={() => { setProject(null); setSelectedFile(null); }}
                  style={{ fontSize: 14, gap: 4 }}
                >
                  ← Projects
                </button>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--quill-secondary)", fontFamily: "var(--font-mono)", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }}>
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
            <ProjectsList onSelect={handleSelectProject} />
          )}
        </aside>

        {/* ── Drag: rail ↔ editor ── */}
        <DragHandle onDrag={dragRail} />

        {/* ── Editor ── */}
        <main className="editor-panel" aria-label="Code editor" style={{ flex: 1, minWidth: 0 }}>
          {fileLoading ? (
            <div className="editor-empty" style={{ flex: 1 }}>
              <span className="serif editor-empty-glyph loading-pulse" style={{ fontSize: 60 }}>…</span>
              <p className="editor-empty-label">Loading file</p>
            </div>
          ) : selectedFile ? (
            <Editor
              content={fileContent}
              onSave={handleSaveFile}
              onContentChange={handleContentChange}
              filename={filename}
              project={project ?? undefined}
              filePath={selectedFile ?? undefined}
            />
          ) : (
            <div className="editor-empty" style={{ flex: 1 }}>
              <span className="serif editor-empty-glyph" style={{ fontSize: 80, color: "var(--rule-emphasis)", fontStyle: "italic" }}>
                {project ? "λ" : "Ω"}
              </span>
              <p className="editor-empty-label" style={{ maxWidth: 260 }}>
                {project
                  ? "Select a file from the explorer to start editing."
                  : "Select a project from the left panel."}
              </p>
              {!project && (
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", justifyContent: "center" }}>
                  <span className="chip chip-neutral">Monaco</span>
                  <span className="chip chip-neutral">Live compile</span>
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
                {selectedFile ?? "Open Overleaf v0.1"}
              </span>
              {mainFile && (
                <span className="status-item" style={{ color: "var(--quill-muted)", fontSize: 11 }}>
                  ⌖ {mainFile}
                </span>
              )}
            </div>
            <div className="status-right">
              <span className="status-item" style={{
                color: saveState === "saved" ? "var(--ink-success)"
                  : saveState === "saving"   ? "var(--lamp)"
                  : saveState === "error"    ? "var(--ink-danger)"
                  : "var(--quill-muted)"
              }}>
                {saveState === "saving" ? "⟳ Saving…"
                  : saveState === "saved"  ? "✓ Saved"
                  : saveState === "error"  ? "✗ Save failed"
                  : "UTF-8"}
              </span>
            </div>
          </div>
        </main>

        {/* ── Drag: editor ↔ preview ── */}
        <DragHandle onDrag={dragPreview} />

        {/* ── PDF Preview ── */}
        <PdfPanel
          project={project}
          mainFile={mainFile}
          pdfKey={pdfKey}
          compileState={compileState}
          compileLog={compileLog}
          errorCount={errorCount}
          warningCount={warningCount}
          onManualCompile={handleManualCompile}
          onDownload={handleDownload}
          width={previewWidth}
        />
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
