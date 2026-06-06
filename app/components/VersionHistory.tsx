"use client";

import { useState, useEffect, useCallback } from "react";
import { DiffEditor } from "@monaco-editor/react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Commit = {
  sha:     string;
  message: string;
  author:  string;
  date:    string;
  url:     string;
};
type ViewMode = "diff" | "previous" | "current";
type PdfState = "idle" | "compiling" | "ready" | "error";

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)   return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30)   return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return mo < 12 ? `${mo}mo ago` : `${Math.floor(mo / 12)}y ago`;
}

function getLang(p: string) {
  const ext = p.split(".").pop()?.toLowerCase() ?? "";
  return ({ tex: "latex", bib: "bibtex", md: "markdown", json: "json" } as any)[ext] ?? "plaintext";
}

function firstLine(msg: string) { return msg.split("\n")[0].trim() || "(no message)"; }

// ── Component ─────────────────────────────────────────────────────────────────
type Props = {
  project:        string;
  filePath:       string;
  mainFile:       string | null;
  currentContent: string;
  currentPdfSrc:  string | null;
  engine:         string;
  onRestore:      (content: string, sha: string) => Promise<void>;
  onClose:        () => void;
};

export default function VersionHistory({
  project, filePath, mainFile, currentContent, currentPdfSrc, engine, onRestore, onClose,
}: Props) {
  const [commits,        setCommits]        = useState<Commit[]>([]);
  const [loadingList,    setLoadingList]    = useState(true);
  const [listError,      setListError]      = useState<string | null>(null);

  const [selected,       setSelected]       = useState<string | null>(null);
  const [loadedContents, setLoadedContents] = useState<Map<string, string>>(new Map());
  const [loadingContent, setLoadingContent] = useState(false);

  const [viewMode,       setViewMode]       = useState<ViewMode>("diff");
  const [sideBySide,     setSideBySide]     = useState(true);
  const [restoring,      setRestoring]      = useState(false);

  // PDF preview for the previous version
  const [pdfState,       setPdfState]       = useState<PdfState>("idle");
  const [pdfSrc,         setPdfSrc]         = useState<string | null>(null);
  const [pdfError,       setPdfError]       = useState<string | null>(null);

  const monacoTheme = typeof document !== "undefined" &&
    document.documentElement.classList.contains("theme-light") ? "oo-light" : "oo-dark";
  const language = getLang(filePath);

  // ── Load commit list ───────────────────────────────────────────────────────
  useEffect(() => {
    setLoadingList(true);
    setListError(null);
    setCommits([]);
    setSelected(null);
    fetch(`/api/projects/${encodeURIComponent(project)}/history?path=${encodeURIComponent(filePath)}&per_page=40`)
      .then(r => r.json())
      .then(d => { if (d.ok) setCommits(d.commits ?? []); else setListError(d.error ?? "Failed to load history"); })
      .catch(e => setListError(e.message))
      .finally(() => setLoadingList(false));
  }, [project, filePath]);

  // ── Load content for selected commit ──────────────────────────────────────
  useEffect(() => {
    if (!selected || loadedContents.has(selected)) return;
    setLoadingContent(true);
    fetch(`/api/projects/${encodeURIComponent(project)}/history?path=${encodeURIComponent(filePath)}&sha=${selected}`)
      .then(r => r.json())
      .then(d => {
        const content = d.ok ? (d.content ?? "") : `// Error: ${d.error}`;
        setLoadedContents(prev => new Map(prev).set(selected, content));
      })
      .catch(e => setLoadedContents(prev => new Map(prev).set(selected, `// Error: ${e.message}`)))
      .finally(() => setLoadingContent(false));
  }, [selected, project, filePath]); // eslint-disable-line

  // Reset state when commit changes
  useEffect(() => {
    setViewMode("diff");
    setPdfState("idle");
    setPdfSrc(null);
    setPdfError(null);
  }, [selected]);

  // ── Compile preview for previous version ──────────────────────────────────
  const compilePreviousVersion = useCallback(async () => {
    if (!selected || !mainFile) return;
    const content = loadedContents.get(selected);
    if (!content) return;
    setPdfState("compiling");
    setPdfError(null);
    try {
      const res  = await fetch(`/api/projects/${encodeURIComponent(project)}/preview-at-sha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, mainFile, sha: selected, engine }),
      });
      const data = await res.json();
      if (data.ok) {
        const sha7 = selected.slice(0, 7);
        const src  = `/api/projects/${encodeURIComponent(project)}/preview-at-sha?key=${sha7}&file=${encodeURIComponent(data.pdfName ?? "main.pdf")}`;
        setPdfSrc(src);
        setPdfState("ready");
      } else {
        setPdfError(data.error ?? "Compilation failed");
        setPdfState("error");
      }
    } catch (e: any) {
      setPdfError(e.message);
      setPdfState("error");
    }
  }, [selected, mainFile, project, engine, loadedContents]);

  // ── Restore ───────────────────────────────────────────────────────────────
  const handleRestore = useCallback(async () => {
    if (!selected || restoring) return;
    const content = loadedContents.get(selected);
    if (content == null) return;
    setRestoring(true);
    try { await onRestore(content, selected); }
    finally { setRestoring(false); }
  }, [selected, restoring, loadedContents, onRestore]);

  const selectedCommit  = commits.find(c => c.sha === selected);
  const selectedContent = selected ? (loadedContents.get(selected) ?? null) : null;

  // Tab button style
  const tabStyle = (active: boolean): React.CSSProperties => ({
    background: "none", border: "none", cursor: "pointer",
    padding: "9px 16px", fontSize: "0.75rem",
    fontWeight: active ? 600 : 400,
    color: active ? "var(--quill-primary)" : "var(--quill-muted)",
    borderBottom: active ? "2px solid var(--lamp)" : "2px solid transparent",
    transition: "color 0.12s, border-color 0.12s",
    whiteSpace: "nowrap" as const,
  });

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 30,
      background: "var(--ink-base)",
      display: "flex", flexDirection: "row",
    }}>

      {/* ═══ LEFT: Commit list (240px) ═══════════════════════════════════════ */}
      <div style={{
        width: 240, flexShrink: 0,
        borderRight: "1px solid var(--rule-soft)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "0 14px", height: 50, flexShrink: 0,
          borderBottom: "1px solid var(--rule-soft)",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--quill-muted)", flex: 1 }}>
            ◷ Version history
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--quill-muted)", fontSize: 20, lineHeight: 1, padding: "0 2px" }} title="Close">×</button>
        </div>

        {/* File chip */}
        <div style={{ padding: "5px 14px", borderBottom: "1px solid var(--rule-faint)", fontSize: "0.625rem", fontFamily: "var(--font-mono)", color: "var(--quill-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={filePath}>
          {filePath}
        </div>

        {/* Commit list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loadingList  && <div style={{ padding: "18px 14px", color: "var(--quill-muted)", fontSize: "0.8125rem" }}>Loading…</div>}
          {listError    && <div style={{ padding: "12px 14px", color: "var(--ink-danger)", fontSize: "0.75rem" }}>{listError}</div>}
          {!loadingList && !listError && commits.length === 0 && (
            <div style={{ padding: "18px 14px", color: "var(--quill-muted)", fontSize: "0.8125rem" }}>No commits found.</div>
          )}

          {commits.map((c, i) => {
            const isSel = selected === c.sha;
            return (
              <button
                key={c.sha}
                onClick={() => setSelected(c.sha)}
                style={{
                  width: "100%", textAlign: "left", background: isSel ? "var(--ink-raised)" : "transparent",
                  border: "none", cursor: "pointer",
                  borderBottom: "1px solid var(--rule-faint)",
                  borderLeft: `3px solid ${isSel ? "var(--lamp)" : "transparent"}`,
                  padding: "9px 11px",
                  display: "flex", flexDirection: "column", gap: 3,
                  transition: "background 0.1s",
                } as React.CSSProperties}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: isSel ? "var(--lamp)" : "var(--quill-tertiary)", background: isSel ? "rgba(200,169,110,0.15)" : "var(--ink-sunken)", padding: "1px 5px", borderRadius: 3, flexShrink: 0 }}>
                    {c.sha.slice(0, 7)}
                  </span>
                  {i === 0 && <span style={{ fontSize: "0.5625rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-success)", background: "rgba(100,200,100,0.1)", padding: "1px 4px", borderRadius: 3 }}>latest</span>}
                  <span style={{ marginLeft: "auto", fontSize: "0.625rem", color: "var(--quill-muted)", flexShrink: 0 }}>{timeAgo(c.date)}</span>
                </div>
                <span style={{ fontSize: "0.75rem", color: isSel ? "var(--quill-primary)" : "var(--quill-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: isSel ? 500 : 400 }}>
                  {firstLine(c.message)}
                </span>
                <span style={{ fontSize: "0.625rem", color: "var(--quill-muted)" }}>{c.author}</span>
              </button>
            );
          })}
        </div>

        {!loadingList && commits.length > 0 && (
          <div style={{ padding: "6px 14px", borderTop: "1px solid var(--rule-faint)", fontSize: "0.625rem", color: "var(--quill-muted)", flexShrink: 0 }}>
            {commits.length} commit{commits.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* ═══ RIGHT: Detail view ═══════════════════════════════════════════════ */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>

        {!selected ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--quill-muted)" }}>
            <span style={{ fontSize: 36, opacity: 0.25 }}>◷</span>
            <p style={{ fontSize: "0.875rem", margin: 0 }}>Select a commit to view changes</p>
          </div>
        ) : (
          <>
            {/* Commit meta bar */}
            <div style={{ padding: "0 14px", height: 50, flexShrink: 0, borderBottom: "1px solid var(--rule-soft)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--lamp)", background: "rgba(200,169,110,0.12)", padding: "2px 7px", borderRadius: 4, flexShrink: 0 }}>
                {(selectedCommit?.sha ?? selected).slice(0, 7)}
              </span>
              <span style={{ fontSize: "0.8125rem", color: "var(--quill-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedCommit ? firstLine(selectedCommit.message) : ""}
              </span>
              {selectedCommit?.url && (
                <a href={selectedCommit.url} target="_blank" rel="noreferrer"
                  style={{ fontSize: "0.6875rem", color: "var(--quill-muted)", textDecoration: "none", padding: "3px 8px", border: "1px solid var(--rule-faint)", borderRadius: "var(--r-sm)", flexShrink: 0 }}>
                  ↗ GitHub
                </a>
              )}
            </div>

            {/* Tab bar */}
            <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--rule-soft)", padding: "0 6px", flexShrink: 0 }}>
              <button style={tabStyle(viewMode === "diff")}     onClick={() => setViewMode("diff")}>↕ Code diff</button>
              <button style={tabStyle(viewMode === "previous")} onClick={() => setViewMode("previous")}>← Previous PDF</button>
              <button style={tabStyle(viewMode === "current")}  onClick={() => setViewMode("current")}>Current PDF →</button>
              {viewMode === "diff" && (
                <button
                  onClick={() => setSideBySide(s => !s)}
                  style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: "0.6875rem", color: "var(--quill-muted)", padding: "6px 12px" }}
                  title="Toggle side-by-side / inline diff"
                >
                  {sideBySide ? "⊟ Inline" : "⊞ Side by side"}
                </button>
              )}
            </div>

            {/* Content area */}
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>

              {/* ── Code diff tab ─────────────────────────────────────────── */}
              {viewMode === "diff" && (
                loadingContent ? (
                  <CenteredMsg>Loading commit…</CenteredMsg>
                ) : selectedContent != null ? (
                  <DiffEditor
                    key={`diff-${selected}-${sideBySide ? "side" : "inline"}`}
                    height="100%"
                    language={language}
                    original={selectedContent}
                    modified={currentContent}
                    theme={monacoTheme}
                    options={{
                      readOnly: true,
                      renderSideBySide: sideBySide,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      fontSize: 13,
                      lineNumbers: "on",
                      folding: false,
                      wordWrap: "on",
                      diffWordWrap: "on",
                    }}
                  />
                ) : null
              )}

              {/* ── Previous PDF tab ──────────────────────────────────────── */}
              {viewMode === "previous" && (
                <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                  {pdfState === "idle" && (
                    <CenteredMsg>
                      {loadingContent ? (
                        <span style={{ color: "var(--quill-muted)", fontSize: "0.875rem" }}>Loading commit content…</span>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: "0.875rem", color: "var(--quill-muted)" }}>
                            {mainFile ? "Compile this version to preview its PDF output." : "No .tex main file selected."}
                          </span>
                          {mainFile && selectedContent != null && (
                            <button
                              onClick={compilePreviousVersion}
                              style={{
                                padding: "8px 20px", borderRadius: "var(--r-sm)",
                                background: "rgba(200,169,110,0.14)", border: "1px solid rgba(200,169,110,0.4)",
                                color: "var(--lamp)", fontSize: "0.875rem", cursor: "pointer",
                              }}
                            >
                              ⚙ Compile preview
                            </button>
                          )}
                        </div>
                      )}
                    </CenteredMsg>
                  )}
                  {pdfState === "compiling" && <CenteredMsg><span className="loading-pulse">Compiling…</span></CenteredMsg>}
                  {pdfState === "error"     && (
                    <CenteredMsg>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                        <span style={{ color: "var(--ink-danger)", fontSize: "0.875rem" }}>{pdfError}</span>
                        <button onClick={compilePreviousVersion}
                          style={{ padding: "6px 14px", borderRadius: "var(--r-sm)", background: "rgba(200,80,80,0.1)", border: "1px solid rgba(200,80,80,0.3)", color: "var(--ink-danger)", fontSize: "0.8125rem", cursor: "pointer" }}>
                          Retry
                        </button>
                      </div>
                    </CenteredMsg>
                  )}
                  {pdfState === "ready" && pdfSrc && (
                    <iframe src={pdfSrc} style={{ flex: 1, border: "none", background: "#fff" }} title="Previous version PDF" />
                  )}
                </div>
              )}

              {/* ── Current PDF tab ───────────────────────────────────────── */}
              {viewMode === "current" && (
                <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                  {currentPdfSrc ? (
                    <iframe src={currentPdfSrc} style={{ flex: 1, border: "none", background: "#fff" }} title="Current version PDF" />
                  ) : (
                    <CenteredMsg>No compiled PDF yet. Compile the project first.</CenteredMsg>
                  )}
                </div>
              )}

            </div>

            {/* Action bar */}
            <div style={{ padding: "10px 14px", borderTop: "1px solid var(--rule-soft)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: "0.75rem", color: "var(--quill-muted)", flex: 1 }}>
                {selectedCommit?.author}{selectedCommit ? ` · ${timeAgo(selectedCommit.date)}` : ""}
              </span>
              <button
                onClick={handleRestore}
                disabled={restoring || !selectedContent}
                style={{
                  padding: "6px 14px", borderRadius: "var(--r-sm)",
                  background: restoring ? "rgba(200,80,80,0.04)" : "rgba(200,80,80,0.1)",
                  border: "1px solid rgba(200,80,80,0.35)", color: "var(--ink-danger)",
                  fontSize: "0.8125rem", cursor: restoring ? "not-allowed" : "pointer",
                  opacity: (restoring || !selectedContent) ? 0.6 : 1, transition: "opacity 0.12s",
                }}
              >
                {restoring ? "Restoring…" : "Restore this version"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CenteredMsg({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--quill-muted)", fontSize: "0.875rem" }}>
      {children}
    </div>
  );
}
