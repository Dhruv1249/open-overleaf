"use client";

import { useEffect, useState } from "react";

type Project = { name: string; manifest?: any };
type Session = { login: string; avatar_url?: string } | null;

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

export default function ProjectsList({ onSelect }: { onSelect: (name: string) => void }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [session, setSession] = useState<Session>(null);
  const [loading, setLoading] = useState(true);
  const [activeProject, setActiveProject] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/auth/session").then((r) => r.json()),
    ])
      .then(([pRes, sRes]) => {
        if (!mounted) return;
        setProjects(pRes.projects || []);
        setSession(sRes.user || null);
      })
      .catch(console.error)
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const handleConnect = () => { window.location.href = "/api/auth/github/login"; };
  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  };

  // ── Loading ─────────────────────────────────────────────────────────────────
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
      {/* Header */}
      <div className="panel-header">
        <span className="panel-header-label">Projects</span>
        {session ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: "var(--quill-tertiary)", fontFamily: "var(--font-mono)" }}>
              @{session.login}
            </span>
            <button className="btn-sm" onClick={handleLogout} style={{ fontSize: 13, padding: "2px 7px" }}>
              Sign out
            </button>
          </div>
        ) : (
          <button className="btn-sm btn-primary" onClick={handleConnect} style={{ fontSize: 13 }}>
            <GitHubIcon />
            Connect
          </button>
        )}
      </div>

      {/* Auth notice */}
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

      {/* Project list */}
      <div className="panel-scroll" style={{ flex: 1 }}>
        {projects && projects.length > 0 ? (
          projects.map((p) => (
            <div
              key={p.name}
              className={`project-card ${activeProject === p.name ? "active" : ""}`}
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
                    <span className="chip chip-neutral" style={{ fontSize: 11, padding: "1px 5px" }}>
                      {p.manifest?.compiler || "xelatex"}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--quill-muted)" }}>
                      {p.manifest?.branch || "main"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div style={{ padding: "20px 16px" }}>
            <p style={{ fontSize: 15, color: "var(--quill-muted)", lineHeight: 1.6 }}>
              {session
                ? "No projects found. Create top-level directories in your repository."
                : "Sign in to load your projects."}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: "10px 16px", borderTop: "1px solid var(--rule-soft)", flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--quill-muted)", marginBottom: 4 }}>
          Storage
        </div>
        <div style={{ fontSize: 14, color: "var(--quill-tertiary)", lineHeight: 1.5 }}>
          GitHub is source of truth. No external database.
        </div>
      </div>
    </div>
  );
}
