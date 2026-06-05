import ProjectsList from "./components/ProjectsList";
import ThemeToggle from "./components/ThemeToggle";

export default function Home() {
  return (
    <div className="app-shell">
      {/* ── Title bar ── */}
      <header className="app-titlebar">
        {/* Left: Wordmark */}
        <div className="wordmark">
          <div className="wordmark-logo">Ω</div>
          <div>
            <div className="wordmark-text">Open Overleaf</div>
          </div>
          <span className="wordmark-tag" style={{ marginLeft: 4 }}>
            GitHub-backed LaTeX
          </span>
        </div>

        {/* Center: Current context */}
        <div className="titlebar-center">
          <nav className="breadcrumb" aria-label="Application context">
            <span>Projects</span>
          </nav>
        </div>

        {/* Right: Controls */}
        <div className="titlebar-right">
          <span className="chip chip-success" style={{ fontSize: 10 }}>
            ● OAuth ready
          </span>
          <ThemeToggle />
          <a
            href="/api/auth/github/login"
            className="btn-sm btn-primary"
            style={{ textDecoration: "none", fontSize: 11 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            Connect GitHub
          </a>
        </div>
      </header>

      {/* ── Main workspace ── */}
      <div className="app-body">
        {/* ── Left rail: projects + file tree ── */}
        <aside className="rail-panel" aria-label="Projects and files">
          <ProjectsList />
        </aside>

        {/* ── Center: editor + status ── */}
        <main
          className="editor-panel"
          aria-label="Code editor"
          style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
        >
          {/* Empty state — shown until a project/file is opened */}
          <div className="editor-empty" style={{ flex: 1 }}>
            <span
              className="serif editor-empty-glyph"
              style={{ fontSize: 64, color: "var(--rule-emphasis)", fontStyle: "italic" }}
            >
              Ω
            </span>
            <p className="editor-empty-label" style={{ maxWidth: 280 }}>
              Select a project from the left panel to open the workspace editor.
              Connect GitHub first to load your repositories.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <span className="chip chip-neutral">Monaco editor</span>
              <span className="chip chip-neutral">SyncTeX</span>
              <span className="chip chip-neutral">TexLab LSP</span>
              <span className="chip chip-neutral">PDF preview</span>
            </div>
          </div>

          {/* Status bar */}
          <div className="status-bar">
            <div className="status-left">
              <span className="status-item">Open Overleaf v0.1</span>
              <span className="status-item">Single-user mode</span>
            </div>
            <div className="status-right">
              <span className="status-item lamp">xelatex · biber</span>
              <span className="status-item">UTF-8</span>
            </div>
          </div>
        </main>

        {/* ── Right panel: PDF preview (shown when no project open) ── */}
        <aside className="preview-panel" aria-label="PDF preview">
          <div className="panel-header">
            <span className="panel-header-label">PDF Preview</span>
            <span className="chip chip-neutral" style={{ fontSize: 10, padding: "1px 6px" }}>
              SyncTeX
            </span>
          </div>

          {/* Idle preview */}
          <div className="preview-placeholder">
            <div style={{
              width: "100%",
              maxWidth: 220,
              aspectRatio: "210/297",
              background: "#f8f5ee",
              borderRadius: "var(--r-xs)",
              border: "1px solid var(--rule-soft)",
              boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
              display: "flex",
              flexDirection: "column",
              padding: 20,
              gap: 8,
              flexShrink: 0,
            }}>
              <div style={{ height: 3, width: "65%", background: "#2a2520", borderRadius: 1 }} />
              <div style={{ height: 2, width: "48%", background: "#2a2520", borderRadius: 1, opacity: 0.5 }} />
              <div style={{ height: 12 }} />
              {[100, 100, 80, 100, 90, 100, 100, 65].map((w, i) => (
                <div key={i} style={{ height: 1.5, width: `${w}%`, background: "#2a2520", borderRadius: 1, opacity: 0.35, marginTop: 2 }} />
              ))}
              <div style={{ height: 8 }} />
              <div style={{ height: 2, width: "42%", background: "#2a2520", borderRadius: 1, opacity: 0.6 }} />
              <div style={{ height: 4 }} />
              {[100, 100, 88, 72].map((w, i) => (
                <div key={i} style={{ height: 1.5, width: `${w}%`, background: "#2a2520", borderRadius: 1, opacity: 0.35, marginTop: 2 }} />
              ))}
            </div>
            <p className="preview-placeholder-text" style={{ maxWidth: 180 }}>
              Compile a .tex file to render the PDF here with SyncTeX click-through.
            </p>
          </div>

          {/* Compile info */}
          <div style={{ borderTop: "1px solid var(--rule-soft)", flexShrink: 0 }}>
            <div className="info-row">
              <span className="info-label">Compiler</span>
              <span className="info-value">xelatex</span>
            </div>
            <div className="info-row">
              <span className="info-label">Bibliography</span>
              <span className="info-value">biber</span>
            </div>
            <div className="info-row">
              <span className="info-label">Debounce</span>
              <span className="info-value">2 000 ms</span>
            </div>
            <div className="info-row" style={{ borderBottom: "none" }}>
              <span className="info-label">Backup</span>
              <span className="info-value">Google Drive</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
