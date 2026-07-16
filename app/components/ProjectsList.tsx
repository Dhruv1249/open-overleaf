"use client";

import { useEffect, useState, useCallback } from "react";

type Project = { name: string; manifest?: any };
type Session = { login: string; avatar_url?: string } | null;

// ── Icons ──────────────────────────────────────────────────────────────────────
function GitHubIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}
function FolderSvg({ active }: { active: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      style={{ color: active ? "var(--lamp)" : "var(--quill-muted)", flexShrink: 0, transition: "color 100ms" }}>
      <path d="M3 7a2 2 0 012-2h3.586a1 1 0 01.707.293L10.707 6.7A1 1 0 0011.414 7H19a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="7" y1="2" x2="7" y2="12" />
      <line x1="2" y1="7" x2="12" y2="7" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <polyline points="3,5 13,5" />
      <path d="M6 5V3h4v2" />
      <path d="M4 5l1 9h6l1-9" />
    </svg>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────────
function Modal({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 900,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)",
    }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "var(--ink-float)", border: "1px solid var(--rule-emphasis)",
        borderRadius: "var(--r-md)", padding: 24, width: 360,
        boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
      }}>
        <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--quill-primary)", marginBottom: 16 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ProjectsList({ onSelect }: { onSelect: (name: string) => void }) {
  const [projects,       setProjects]       = useState<Project[] | null>(null);
  const [session,        setSession]        = useState<Session>(null);
  const [loading,        setLoading]        = useState(true);
  const [activeProject,  setActiveProject]  = useState<string | null>(null);
  const [hoveredProject, setHoveredProject] = useState<string | null>(null);

  // Create dialog state
  const [showCreate,   setShowCreate]   = useState(false);
  const [createName,   setCreateName]   = useState("");
  const [createDesc,   setCreateDesc]   = useState("");
  const [creating,     setCreating]     = useState(false);
  const [createError,  setCreateError]  = useState<string | null>(null);

  // Delete dialog state
  const [deleteTarget,  setDeleteTarget]  = useState<string | null>(null);
  const [deleting,      setDeleting]      = useState(false);
  const [deleteError,   setDeleteError]   = useState<string | null>(null);

  // ── Load ───────────────────────────────────────────────────────────────────
  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/auth/session").then((r) => r.json()),
    ])
      .then(([pRes, sRes]) => {
        setProjects(pRes.projects || []);
        setSession(sRes.user || null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleConnect = () => { window.location.href = "/api/auth/github/login"; };

  // ── Create ─────────────────────────────────────────────────────────────────
  const openCreate = () => {
    setCreateName(""); setCreateDesc(""); setCreateError(null); setShowCreate(true);
  };
  const submitCreate = useCallback(async () => {
    if (!createName.trim()) return;
    setCreating(true); setCreateError(null);
    try {
      const res  = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName.trim(), description: createDesc.trim() }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to create project");
      setShowCreate(false);
      loadData();
    } catch (e: any) { setCreateError(e.message); }
    finally { setCreating(false); }
  }, [createName, createDesc, loadData]);

  // ── Delete ─────────────────────────────────────────────────────────────────
  const submitDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true); setDeleteError(null);
    try {
      const res  = await fetch(`/api/projects?name=${encodeURIComponent(deleteTarget)}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to delete project");
      setDeleteTarget(null);
      if (activeProject === deleteTarget) setActiveProject(null);
      loadData();
    } catch (e: any) { setDeleteError(e.message); }
    finally { setDeleting(false); }
  }, [deleteTarget, activeProject, loadData]);

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div className="panel-header">
          <div className="skeleton" style={{ width: 60, height: 10 }} />
        </div>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ padding: "10px 16px", borderBottom: "1px solid var(--rule-faint)" }}>
            <div className="skeleton" style={{ width: `${50 + i * 10}%`, height: 10, marginBottom: 6 }} />
            <div className="skeleton" style={{ width: "70%", height: 8 }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ── Header ── */}
      <div className="panel-header">
        <span className="panel-header-label">Projects</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {session && (
            <button
              className="icon-btn"
              title="New Project"
              onClick={openCreate}
              style={{ color: "var(--lamp)" }}
            >
              <PlusIcon />
            </button>
          )}
          {!session && (
            <button className="btn-sm btn-primary" onClick={handleConnect} style={{ fontSize: "0.75rem" }}>
              <GitHubIcon />
              Connect
            </button>
          )}
        </div>
      </div>

      {/* ── Auth notice ── */}
      {!session && (
        <div className="auth-notice">
          <div className="auth-notice-title">GitHub not connected</div>
          <div className="auth-notice-body" style={{ marginBottom: 10 }}>
            Connect to load projects from your GitHub repository.
          </div>
          <button className="btn-sm btn-primary" onClick={handleConnect}>
            <GitHubIcon />
            Connect GitHub
          </button>
        </div>
      )}

      {/* ── Project list ── */}
      <div className="panel-scroll" style={{ flex: 1 }}>
        {projects && projects.length > 0 ? (
          projects.map((p) => (
            <div
              key={p.name}
              className={`project-card ${activeProject === p.name ? "active" : ""}`}
              style={{ position: "relative" }}
              onMouseEnter={() => setHoveredProject(p.name)}
              onMouseLeave={() => setHoveredProject(null)}
              onClick={() => {
                setActiveProject(p.name);
                onSelect(p.name);
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <FolderSvg active={activeProject === p.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="project-name">{p.name}</div>
                  {p.manifest?.description && (
                    <div className="project-desc">{p.manifest.description}</div>
                  )}
                  <div className="project-meta" style={{ marginTop: 4, gap: 6 }}>
                    <span className="chip chip-neutral" style={{ fontSize: "0.6875rem", padding: "1px 5px" }}>
                      {p.manifest?.compiler || "xelatex"}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--quill-muted)" }}>
                      {p.manifest?.branch || "main"}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Delete button (hover only) ── */}
              <button
                title={`Delete project "${p.name}"`}
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteError(null);
                  setDeleteTarget(p.name);
                }}
                style={{
                  position: "absolute", top: 10, right: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 26, height: 26,
                  background: "var(--ink-danger-dim)",
                  border: "1px solid rgba(176,82,82,0.25)",
                  borderRadius: "var(--r-sm)",
                  color: "var(--ink-danger)",
                  cursor: "pointer",
                  opacity: hoveredProject === p.name ? 1 : 0,
                  pointerEvents: hoveredProject === p.name ? "auto" : "none",
                  transition: "opacity 0.15s ease",
                }}
              >
                <TrashIcon />
              </button>
            </div>
          ))
        ) : (
          <div style={{ padding: "20px 16px" }}>
            <p style={{ fontSize: "0.8125rem", color: "var(--quill-muted)", lineHeight: 1.6 }}>
              {session
                ? "No projects found. Click + to create your first project."
                : "Sign in to load your projects."}
            </p>
            {session && (
              <button
                className="btn-sm btn-primary"
                onClick={openCreate}
                style={{ marginTop: 8, gap: 6 }}
              >
                <PlusIcon />
                New Project
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Create project modal ── */}
      {showCreate && (
        <Modal title="New Project" onClose={() => setShowCreate(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--quill-tertiary)", marginBottom: 4 }}>
                Project name *
              </label>
              <input
                type="text"
                autoFocus
                placeholder="my-thesis"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitCreate(); }}
                style={{
                  width: "100%", padding: "7px 10px",
                  background: "var(--ctrl-bg)", border: "1px solid var(--ctrl-border)",
                  borderRadius: "var(--r-sm)", color: "var(--quill-primary)",
                  fontSize: "0.875rem", fontFamily: "var(--font-mono)", outline: "none",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => (e.target.style.borderColor = "var(--rule-focus)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--ctrl-border)")}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--quill-tertiary)", marginBottom: 4 }}>
                Description (optional)
              </label>
              <input
                type="text"
                placeholder="Short description…"
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitCreate(); }}
                style={{
                  width: "100%", padding: "7px 10px",
                  background: "var(--ctrl-bg)", border: "1px solid var(--ctrl-border)",
                  borderRadius: "var(--r-sm)", color: "var(--quill-primary)",
                  fontSize: "0.875rem", fontFamily: "var(--font-ui)", outline: "none",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => (e.target.style.borderColor = "var(--rule-focus)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--ctrl-border)")}
              />
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--quill-muted)" }}>
              Creates a new top-level directory on GitHub. Name may only contain letters, numbers, hyphens, underscores, spaces, and dots.
            </div>
            {createError && (
              <div style={{ fontSize: "0.8125rem", color: "var(--ink-danger)", padding: "6px 8px", background: "var(--ink-danger-dim)", borderRadius: "var(--r-sm)" }}>
                {createError}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 16, justifyContent: "flex-end" }}>
            <button className="btn-sm btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
            <button
              className="btn-sm"
              onClick={submitCreate}
              disabled={creating || !createName.trim()}
              style={{ background: "var(--lamp-dim)", borderColor: "rgba(200,169,110,0.3)", color: "var(--lamp)" }}
            >
              {creating ? "Creating…" : "Create Project"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Delete confirmation modal ── */}
      {deleteTarget && (
        <Modal title={`Delete "${deleteTarget}"?`} onClose={() => setDeleteTarget(null)}>
          <p style={{ fontSize: "0.875rem", color: "var(--quill-secondary)", lineHeight: 1.65, margin: 0 }}>
            This will <strong>permanently delete</strong> the project <code>{deleteTarget}</code> and all its files
            from GitHub. This action cannot be undone.
          </p>
          {deleteError && (
            <div style={{ marginTop: 10, fontSize: "0.8125rem", color: "var(--ink-danger)", padding: "6px 8px", background: "var(--ink-danger-dim)", borderRadius: "var(--r-sm)" }}>
              {deleteError}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 16, justifyContent: "flex-end" }}>
            <button className="btn-sm btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button
              className="btn-sm"
              onClick={submitDelete}
              disabled={deleting}
              style={{ background: "var(--ink-danger-dim)", borderColor: "rgba(176,82,82,0.3)", color: "var(--ink-danger)" }}
            >
              {deleting ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
