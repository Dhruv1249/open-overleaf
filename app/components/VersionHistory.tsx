"use client";

import { useState, useEffect, useCallback } from "react";

type Commit = {
  sha:     string;
  message: string;
  author:  string;
  date:    string;
  url:     string;
};

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
  if (mo < 12)  return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

type Props = {
  project:   string;
  filePath:  string;
  onRestore: (content: string, sha: string) => Promise<void>;
  onClose:   () => void;
};

export default function VersionHistory({ project, filePath, onRestore, onClose }: Props) {
  const [commits,     setCommits]     = useState<Commit[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [expanded,    setExpanded]    = useState<string | null>(null);
  const [previewing,  setPreviewing]  = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string>("");
  const [restoring,   setRestoring]   = useState<string | null>(null);

  // ── Load commits ─────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError(null);
    setCommits([]);
    setExpanded(null);
    setPreviewing(null);
    fetch(`/api/projects/${encodeURIComponent(project)}/history?path=${encodeURIComponent(filePath)}&per_page=30`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) setCommits(data.commits);
        else setError(data.error || "Failed to load history");
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [project, filePath]);

  // ── Load preview content ─────────────────────────────────────────────────
  const loadPreview = useCallback(async (sha: string) => {
    if (previewing === sha) { setPreviewing(null); setPreviewContent(""); return; }
    setPreviewing(sha);
    setPreviewContent("Loading…");
    try {
      const res  = await fetch(`/api/projects/${encodeURIComponent(project)}/history?path=${encodeURIComponent(filePath)}&sha=${sha}`);
      const data = await res.json();
      setPreviewContent(data.ok ? data.content : `Error: ${data.error}`);
    } catch (e: any) {
      setPreviewContent(`Error: ${e.message}`);
    }
  }, [project, filePath, previewing]);

  // ── Restore ──────────────────────────────────────────────────────────────
  const handleRestore = useCallback(async (sha: string) => {
    if (restoring) return;
    setRestoring(sha);
    try {
      // Fetch content at this commit
      const res  = await fetch(`/api/projects/${encodeURIComponent(project)}/history?path=${encodeURIComponent(filePath)}&sha=${sha}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to fetch version");
      await onRestore(data.content, sha);
    } catch (e: any) {
      alert(`Restore failed: ${e.message}`);
    } finally {
      setRestoring(null);
    }
  }, [project, filePath, onRestore, restoring]);

  // ── Format commit message ────────────────────────────────────────────────
  const firstLine  = (msg: string) => msg.split("\n")[0].trim();

  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "var(--ink-base)",
      display: "flex", flexDirection: "column",
      zIndex: 20,
      borderLeft: "1px solid var(--rule-soft)",
    }}>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "0 14px", height: 55, flexShrink: 0,
        borderBottom: "1px solid var(--rule-soft)",
      }}>
        <span style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--quill-muted)" }}>
          ◷ Version History
        </span>
        <span style={{ flex: 1, fontSize: "0.6875rem", color: "var(--quill-tertiary)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {filePath}
        </span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--quill-muted)", fontSize: 18, lineHeight: 1, padding: "2px 4px" }}
          title="Close history"
        >
          ×
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {loading && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--quill-muted)", fontSize: "0.8125rem" }}>
            Loading commits…
          </div>
        )}
        {error && (
          <div style={{ padding: 16, color: "var(--ink-danger)", fontSize: "0.8125rem" }}>
            {error}
          </div>
        )}
        {!loading && !error && commits.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--quill-muted)", fontSize: "0.8125rem" }}>
            No commits found for this file.
          </div>
        )}
        {commits.map((c, i) => {
          const isExp = expanded === c.sha;
          const isPrev = previewing === c.sha;
          const isRestoring = restoring === c.sha;
          const isFirst = i === 0;

          return (
            <div key={c.sha} style={{
              borderBottom: "1px solid var(--rule-faint)",
              background: isExp ? "var(--ink-raised)" : "transparent",
              transition: "background 0.12s",
            }}>
              {/* Commit row */}
              <button
                onClick={() => setExpanded(isExp ? null : c.sha)}
                style={{
                  width: "100%", padding: "10px 14px",
                  background: "none", border: "none", cursor: "pointer", textAlign: "left",
                  display: "flex", flexDirection: "column", gap: 3,
                }}
              >
                {/* First commit badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: "0.6875rem",
                    color: "var(--lamp)", background: "rgba(200,169,110,0.12)",
                    padding: "1px 5px", borderRadius: 3, flexShrink: 0,
                  }}>
                    {c.sha.slice(0, 7)}
                  </span>
                  {isFirst && (
                    <span style={{
                      fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em",
                      textTransform: "uppercase", color: "var(--ink-success)",
                      background: "rgba(100,200,100,0.12)",
                      padding: "1px 5px", borderRadius: 3,
                    }}>
                      latest
                    </span>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: "0.6875rem", color: "var(--quill-muted)", flexShrink: 0 }}>
                    {timeAgo(c.date)}
                  </span>
                </div>
                <span style={{
                  fontSize: "0.8125rem", color: "var(--quill-secondary)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  maxWidth: "100%",
                }}>
                  {firstLine(c.message) || "(no message)"}
                </span>
                <span style={{ fontSize: "0.6875rem", color: "var(--quill-muted)" }}>
                  {c.author}
                </span>
              </button>

              {/* Expanded actions */}
              {isExp && (
                <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Full message if multi-line */}
                  {c.message.includes("\n") && (
                    <pre style={{
                      margin: 0, fontSize: "0.75rem", color: "var(--quill-tertiary)",
                      fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap", wordBreak: "break-word",
                      background: "var(--ink-sunken)", padding: "6px 8px", borderRadius: "var(--r-xs)",
                    }}>
                      {c.message.trim()}
                    </pre>
                  )}

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {/* Preview button */}
                    <button
                      onClick={() => loadPreview(c.sha)}
                      style={{
                        padding: "4px 10px", borderRadius: "var(--r-sm)",
                        background: isPrev ? "rgba(200,169,110,0.18)" : "var(--ink-raised)",
                        border: `1px solid ${isPrev ? "rgba(200,169,110,0.5)" : "var(--rule-soft)"}`,
                        color: isPrev ? "var(--lamp)" : "var(--quill-secondary)",
                        fontSize: "0.75rem", cursor: "pointer",
                      }}
                    >
                      {isPrev ? "Hide preview" : "Preview"}
                    </button>

                    {/* Restore button */}
                    <button
                      onClick={() => handleRestore(c.sha)}
                      disabled={!!isRestoring}
                      style={{
                        padding: "4px 10px", borderRadius: "var(--r-sm)",
                        background: "rgba(200,80,80,0.08)",
                        border: "1px solid rgba(200,80,80,0.3)",
                        color: "var(--ink-danger)",
                        fontSize: "0.75rem", cursor: isRestoring ? "not-allowed" : "pointer",
                        opacity: isRestoring ? 0.6 : 1,
                      }}
                    >
                      {isRestoring ? "Restoring…" : "Restore this version"}
                    </button>

                    {/* View on GitHub */}
                    {c.url && (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          padding: "4px 10px", borderRadius: "var(--r-sm)",
                          background: "transparent",
                          border: "1px solid var(--rule-faint)",
                          color: "var(--quill-muted)",
                          fontSize: "0.75rem", textDecoration: "none",
                          display: "inline-block",
                        }}
                      >
                        ↗ GitHub
                      </a>
                    )}
                  </div>

                  {/* Content preview pane */}
                  {isPrev && previewContent && (
                    <pre style={{
                      margin: 0, fontSize: "0.6875rem", lineHeight: 1.65,
                      color: "var(--quill-secondary)", fontFamily: "var(--font-mono)",
                      background: "var(--ink-sunken)", padding: "10px 12px",
                      borderRadius: "var(--r-xs)", border: "1px solid var(--rule-faint)",
                      maxHeight: 320, overflowY: "auto",
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}>
                      {previewContent}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {!loading && commits.length > 0 && (
        <div style={{
          padding: "8px 14px", borderTop: "1px solid var(--rule-faint)",
          fontSize: "0.6875rem", color: "var(--quill-muted)",
          flexShrink: 0,
        }}>
          {commits.length} commit{commits.length !== 1 ? "s" : ""} · last {timeAgo(commits[0].date)}
        </div>
      )}
    </div>
  );
}
