"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import ThemeToggle from "./ThemeToggle";
import UserStatus from "./UserStatus";
import ProjectsList from "./ProjectsList";
import ProjectTree from "./ProjectTree";
import Editor from "./Editor";
import VersionHistory from "./VersionHistory";

// ── Google Drive icon (coloured SVG) ─────────────────────────────────────────────────────
function DriveIcon({ color, size = 14 }: { color?: string; size?: number }) {
  // Official Drive brand colours unless overridden
  return (
    <svg width={size} height={size} viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L28.35 53H0c0 1.55.4 3.1 1.2 4.5z" fill={color ?? "#0066da"}/>
      <path d="M43.65 25 29.55 0c-1.35.8-2.5 1.9-3.3 3.3l-25.05 43.4A9.06 9.06 0 0 0 0 51h28.35z" fill={color ?? "#00ac47"}/>
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59l6.4 11.65z" fill={color ?? "#ea4335"}/>
      <path d="M43.65 25 57.75 0H29.55z" fill={color ?? "#00832d"}/>
      <path d="M87.3 51H59L43.65 25 29.55 53H87.3c0-1.55-.4-3.1-1.2-4.5z" fill={color ?? "#2684fc"}/>
      <path d="m59 53-14.95 26H86c.8-1.4 1.2-2.95 1.2-4.5L59 53z" fill={color ?? "#ffba00"}/>
    </svg>
  );
}

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
type CompileMode  = "manual" | "debounced" | "live" | "interval";
type Engine       = "auto" | "xelatex" | "pdflatex" | "lualatex" | "latexmk";

const RAIL_KEY      = "oo-rail-width";
const PREVIEW_KEY   = "oo-preview-width";
const SETTINGS_KEY  = "oo-compiler-settings";

const DEFAULT_SETTINGS = {
  engine:          "auto"       as Engine,
  mode:            "debounced"  as CompileMode,
  intervalSeconds: 30,
  autoSaveSeconds: 3,
  compileTarget:   "current"   as "current" | "root",
  rootFile:        null        as string | null,
};


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
  settings,
  onSettingsChange,
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
  settings: typeof DEFAULT_SETTINGS;
  onSettingsChange: (s: typeof DEFAULT_SETTINGS) => void;
}) {
  const relMf = mainFile ? ((project && mainFile.startsWith(`${project}/`)) ? mainFile.slice(project.length + 1) : mainFile) : null;
  const targetFile = (settings.compileTarget === "root" && settings.rootFile) ? settings.rootFile : relMf;

  const pdfSrc = project && targetFile && pdfKey > 0
    ? `/api/projects/${encodeURIComponent(project)}/pdf?mainFile=${encodeURIComponent(targetFile)}&t=${pdfKey}`
    : null;

  const spinning = compileState === "syncing" || compileState === "compiling";

  // ── Google Drive state ───────────────────────────────────────────────────
  const [driveConnected, setDriveConnected] = React.useState(false);
  const [driveSyncing,   setDriveSyncing]   = React.useState(false);
  const [driveLink,      setDriveLink]      = React.useState<string | null>(null);
  const [drivePath,      setDrivePath]      = React.useState<string | null>(null);
  const [driveError,     setDriveError]     = React.useState<string | null>(null);
  const [lastSynced,     setLastSynced]     = React.useState<Date | null>(null);

  React.useEffect(() => {
    fetch("/api/auth/google/status")
      .then(r => r.json())
      .then(d => setDriveConnected(d.connected === true))
      .catch(() => {});
  }, []);

  const connectDrive = React.useCallback(() => {
    const popup = window.open("/api/auth/google", "google-drive-auth",
      "width=500,height=620,left=200,top=100,resizable=yes,scrollbars=yes");
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "google-auth") {
        window.removeEventListener("message", onMsg);
        if (e.data.status === "success") setDriveConnected(true);
        popup?.close();
      }
    };
    window.addEventListener("message", onMsg);
  }, []);

  const syncToDrive = React.useCallback(async () => {
    if (!project || !mainFile || driveSyncing) return;
    setDriveSyncing(true);
    setDriveError(null);
    try {
      const res  = await fetch("/api/drive/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, mainFile }),
      });
      const data = await res.json();
      if (data.ok) {
        setDriveLink(data.webViewLink);
        setDrivePath(data.drivePath ?? null);
        setLastSynced(new Date());
      } else {
        setDriveError(data.error ?? "Sync failed");
      }
    } catch (e: any) {
      setDriveError(e.message);
    } finally {
      setDriveSyncing(false);
    }
  }, [project, mainFile, driveSyncing]);

  const disconnectDrive = React.useCallback(async () => {
    await fetch("/api/auth/google/status", { method: "DELETE" });
    setDriveConnected(false);
    setDriveLink(null);
    setDrivePath(null);
    setLastSynced(null);
  }, []);

  return (
    <aside className="preview-panel" aria-label="PDF preview" style={{ width, flexShrink: 0 }}>
      {/* Header */}
      <div className="panel-header" style={{ gap: 8, flexWrap: "nowrap", padding: "0 14px", minHeight: 55 }}>
        <span className="panel-header-label">PDF Preview</span>

        {/* Compile status pill */}
        <span style={{

          fontSize: "0.75rem", fontFamily: "var(--font-mono)", padding: "2px 8px",
          borderRadius: 4, whiteSpace: "nowrap",
          background:
            compileState === "success" ? "rgba(100,200,100,0.14)"
          : compileState === "error"   ? "rgba(200,80,80,0.18)"
          : "rgba(200,169,110,0.13)",
          color:
            compileState === "success" ? "var(--ink-success)"
          : compileState === "error"   ? "var(--ink-danger)"
          : "var(--lamp)",
        }}>
          {spinning ? "⟳ compiling…"
           : compileState === "success" ? `✓ ${errorCount}e ${warningCount}w`
           : compileState === "error"   ? `✗ ${errorCount} error${errorCount !== 1 ? "s" : ""}`
           : "auto"}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexShrink: 0 }}>
          {/* Compile button — prominent */}
          <button
            onClick={onManualCompile}
            disabled={!project || !mainFile || spinning}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px",
              background: spinning ? "rgba(200,169,110,0.08)" : "rgba(200,169,110,0.16)",
              border: "1px solid rgba(200,169,110,0.4)",
              borderRadius: "var(--r-sm)",
              color: "var(--lamp)",
              fontFamily: "var(--font-ui)", fontWeight: 600, fontSize: "0.8125rem",
              cursor: !project || !mainFile || spinning ? "not-allowed" : "pointer",
              opacity: !project || !mainFile ? 0.45 : 1,
              transition: "background 0.15s ease, opacity 0.15s ease",
              whiteSpace: "nowrap",
            }}
          >
            <span>{spinning ? "⟳" : "▶"}</span>
            {spinning ? "Compiling…" : "Compile"}
          </button>

          {/* Download */}
          <button
            onClick={onDownload}
            disabled={!pdfSrc}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px",
              background: pdfSrc ? "rgba(78,201,176,0.1)" : "transparent",
              border: `1px solid ${pdfSrc ? "rgba(78,201,176,0.35)" : "var(--rule-soft)"}`,
              borderRadius: "var(--r-sm)",
              color: pdfSrc ? "#4ec9b0" : "var(--quill-muted)",
              fontFamily: "var(--font-ui)", fontWeight: 600, fontSize: "0.8125rem",
              cursor: !pdfSrc ? "not-allowed" : "pointer",
              opacity: !pdfSrc ? 0.45 : 1,
              transition: "background 0.15s ease, opacity 0.15s ease",
              whiteSpace: "nowrap",
            }}
          >
            ⬇ PDF
          </button>

          {/* Drive button */}
          {!driveConnected ? (
            <button
              onClick={connectDrive}
              title="Connect Google Drive to sync your PDF"
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 12px",
                background: "rgba(66,133,244,0.10)",
                border: "1px solid rgba(66,133,244,0.35)",
                borderRadius: "var(--r-sm)",
                color: "#4285f4",
                fontFamily: "var(--font-ui)", fontWeight: 600, fontSize: "0.8125rem",
                cursor: "pointer", whiteSpace: "nowrap",
                transition: "background 0.15s ease",
              }}
            >
              <DriveIcon /> Drive
            </button>
          ) : (
            <button
              onClick={syncToDrive}
              disabled={!pdfSrc || driveSyncing}
              title={lastSynced ? `Last synced ${lastSynced.toLocaleTimeString()}` : "Sync PDF to Google Drive"}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 12px",
                background: driveSyncing ? "rgba(52,168,83,0.06)" : "rgba(52,168,83,0.12)",
                border: "1px solid rgba(52,168,83,0.35)",
                borderRadius: "var(--r-sm)",
                color: "#34a853",
                fontFamily: "var(--font-ui)", fontWeight: 600, fontSize: "0.8125rem",
                cursor: (!pdfSrc || driveSyncing) ? "not-allowed" : "pointer",
                opacity: (!pdfSrc || driveSyncing) ? 0.55 : 1,
                transition: "background 0.15s ease, opacity 0.15s ease",
                whiteSpace: "nowrap",
              }}
            >
              <DriveIcon color="#34a853" />
              {driveSyncing ? "Syncing…" : lastSynced ? "↺ Sync" : "↑ Sync"}
            </button>
          )}
        </div>
      </div>

      {/* Drive status bar */}
      {driveConnected && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "5px 14px",
          borderBottom: "1px solid var(--rule-faint)",
          background: "rgba(52,168,83,0.04)",
          flexShrink: 0, overflow: "hidden",
        }}>
          <DriveIcon color="#34a853" size={12} />
          <div style={{ fontSize: "0.6875rem", color: "var(--quill-muted)", flex: 1, minWidth: 0 }}>
            {driveError ? (
              <span style={{ color: "var(--ink-danger)" }}>{driveError}</span>
            ) : lastSynced ? (
              <>
                <span style={{ opacity: 0.65 }}>{lastSynced.toLocaleTimeString()}</span>
                {" · "}
                {drivePath && (
                  <span
                    title={drivePath}
                    style={{
                      fontFamily: "var(--font-mono)", fontSize: "0.625rem",
                      color: "var(--quill-tertiary)",
                      overflow: "hidden", textOverflow: "ellipsis",
                      maxWidth: "calc(100% - 80px)", display: "inline-block",
                      verticalAlign: "middle", whiteSpace: "nowrap",
                    }}
                  >
                    {drivePath}
                  </span>
                )}
                {" · "}
                <a href={driveLink ?? "#"} target="_blank" rel="noreferrer"
                  style={{ color: "#4285f4", textDecoration: "none", whiteSpace: "nowrap" }}>
                  Open ↗
                </a>
              </>
            ) : (
              "Connected — click ↑ Sync to upload PDF"
            )}
          </div>
          <button
            onClick={disconnectDrive}
            title="Disconnect Google Drive"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--quill-muted)", fontSize: "0.6875rem", padding: "1px 4px", flexShrink: 0 }}
          >
            disconnect
          </button>
        </div>
      )}

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
            <span style={{ fontSize: "0.8125rem", color: "#fff", fontFamily: "var(--font-mono)" }}>
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
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--ink-danger)" }}>
              ✗ Compile errors
            </span>
            <span style={{ fontSize: "0.6875rem", color: "var(--quill-muted)", fontFamily: "var(--font-mono)" }}>
              scroll to see full log
            </span>
          </div>
          <pre style={{
            flex: 1, overflow: "auto", margin: 0, padding: "8px 10px",
            fontSize: "0.6875rem", lineHeight: 1.6,
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
          <summary style={{ padding: "4px 10px", fontSize: "0.6875rem", cursor: "pointer", color: "var(--lamp)" }}>
            {warningCount} warning{warningCount !== 1 ? "s" : ""} — click to expand
          </summary>
          <pre style={{
            margin: 0, padding: "6px 10px", maxHeight: 120, overflow: "auto",
            fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--lamp)",
            whiteSpace: "pre-wrap", wordBreak: "break-all",
          }}>
            {compileLog.split("\n").filter((l: string) => l.toLowerCase().includes("warning")).join("\n")}
          </pre>
        </details>
      )}

      {/* ── Compiler settings footer ── */}
      <div style={{ borderTop: "1px solid var(--rule-soft)", flexShrink: 0, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>

        {/* Engine */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--quill-muted)" }}>Engine</span>
          <select
            value={settings.engine}
            onChange={e => onSettingsChange({ ...settings, engine: e.target.value as Engine })}
            style={{
              background: "var(--ctrl-bg)", border: "1px solid var(--ctrl-border)",
              borderRadius: "var(--r-sm)", color: "var(--quill-secondary)",
              fontSize: "0.75rem", fontFamily: "var(--font-mono)",
              cursor: "pointer", outline: "none", padding: "2px 6px",
            }}
          >
            <option value="auto">auto-detect</option>
            <option value="xelatex">xelatex</option>
            <option value="pdflatex">pdflatex</option>
            <option value="lualatex">lualatex</option>
            <option value="latexmk">latexmk</option>
          </select>
        </div>

        {/* Compile Target */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--quill-muted)" }}>Compile Target</span>
          <select
            value={settings.compileTarget}
            onChange={e => onSettingsChange({ ...settings, compileTarget: e.target.value as "current" | "root" })}
            style={{
              background: "var(--ctrl-bg)", border: "1px solid var(--ctrl-border)",
              borderRadius: "var(--r-sm)", color: "var(--quill-secondary)",
              fontSize: "0.75rem", fontFamily: "var(--font-mono)",
              cursor: "pointer", outline: "none", padding: "2px 6px",
              maxWidth: 140, textOverflow: "ellipsis", whiteSpace: "nowrap"
            }}
          >
            <option value="current">Current file</option>
            <option value="root">Root: {settings.rootFile || "not set"}</option>
          </select>
        </div>

        {/* Compile mode */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--quill-muted)" }}>Compile</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <select
              value={settings.mode}
              onChange={e => onSettingsChange({ ...settings, mode: e.target.value as CompileMode })}
              style={{
                background: "var(--ctrl-bg)", border: "1px solid var(--ctrl-border)",
                borderRadius: "var(--r-sm)", color: "var(--quill-secondary)",
                fontSize: "0.75rem", fontFamily: "var(--font-mono)",
                cursor: "pointer", outline: "none", padding: "2px 6px",
              }}
            >
              <option value="debounced">Auto (2s)</option>
              <option value="live">Live (500ms)</option>
              <option value="interval">Every N seconds</option>
              <option value="manual">Manual</option>
            </select>
            {settings.mode === "interval" && (
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <input
                  type="number"
                  min={5} max={300} step={5}
                  value={settings.intervalSeconds}
                  onChange={e => onSettingsChange({ ...settings, intervalSeconds: Math.max(5, Number(e.target.value)) })}
                  style={{
                    width: 48, padding: "2px 5px",
                    background: "var(--ctrl-bg)", border: "1px solid var(--ctrl-border)",
                    borderRadius: "var(--r-sm)", color: "var(--quill-secondary)",
                    fontSize: "0.75rem", fontFamily: "var(--font-mono)", outline: "none",
                    textAlign: "center",
                  }}
                />
                <span style={{ fontSize: "0.6875rem", color: "var(--quill-muted)" }}>s</span>
              </div>
            )}
          </div>
        </div>

        {/* Auto-save */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--quill-muted)" }}>Auto-save</span>
          <select
            value={settings.autoSaveSeconds}
            onChange={e => onSettingsChange({ ...settings, autoSaveSeconds: Number(e.target.value) })}
            style={{
              background: "var(--ctrl-bg)", border: "1px solid var(--ctrl-border)",
              borderRadius: "var(--r-sm)", color: "var(--quill-secondary)",
              fontSize: "0.75rem", fontFamily: "var(--font-mono)",
              cursor: "pointer", outline: "none", padding: "2px 6px",
            }}
          >
            <option value={2}>After 2s</option>
            <option value={3}>After 3s</option>
            <option value={5}>After 5s</option>
            <option value={10}>After 10s</option>
            <option value={0}>Disabled</option>
          </select>
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

  // Mobile tab
  const [mobileTab, setMobileTab] = useState<"files"|"editor"|"preview">("editor");
  // Version history panel
  const [showHistory,       setShowHistory]       = useState(false);
  // Bumped on version restore to force Editor remount with restored content
  const [editorRestoreKey,  setEditorRestoreKey]  = useState(0);

  // Compiler settings — persisted to GitHub (.overleaf.json) per project
  // localStorage is used as an instant-boot cache to avoid SSR flicker.
  const [compilerSettings, setCompilerSettings] = useState(DEFAULT_SETTINGS);
  const settingsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track which project we last saved settings for (avoids stale saves on project switch)
  const settingsProjectRef = useRef<string | null>(null);

  // Read panel widths from localStorage after hydration (SSR-safe)
  useEffect(() => {
    const r = Number(localStorage.getItem(RAIL_KEY));
    const p = Number(localStorage.getItem(PREVIEW_KEY));
    if (r > 0) setRailWidth(r);
    if (p > 0) setPreviewWidth(p);
  }, []);

  // Persist panel widths
  useEffect(() => { localStorage.setItem(RAIL_KEY,    String(railWidth));    }, [railWidth]);
  useEffect(() => { localStorage.setItem(PREVIEW_KEY, String(previewWidth)); }, [previewWidth]);

  // ── Load project settings from GitHub when project changes ────────────────
  useEffect(() => {
    if (!project) {
      setCompilerSettings(DEFAULT_SETTINGS);
      return;
    }

    // 1. Instant boot: apply cached settings from localStorage immediately
    const cacheKey = `${SETTINGS_KEY}-${project}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) setCompilerSettings(s => ({ ...s, ...JSON.parse(cached) }));
    } catch {}

    // 2. Authoritative: fetch from GitHub; merge & update cache
    fetch(`/api/projects/${encodeURIComponent(project)}/settings`)
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.settings) {
          setCompilerSettings(s => ({ ...s, ...data.settings }));
          // Restore last-used mainFile for this project
          if (data.settings.mainFile) setMainFile(data.settings.mainFile);
          localStorage.setItem(cacheKey, JSON.stringify(data.settings));
        }
      })
      .catch(() => {/* network error — use cached */});

    settingsProjectRef.current = project;
  }, [project]);  

  // ── Debounced save of settings to GitHub on change ────────────────────────
  // We only save after the user is settled (1.5 s), and only when a project is open.
  useEffect(() => {
    const proj = settingsProjectRef.current;
    if (!proj) return;

    // Always update localStorage immediately for instant reload
    const cacheKey = `${SETTINGS_KEY}-${proj}`;
    localStorage.setItem(cacheKey, JSON.stringify(compilerSettings));

    // Debounce the GitHub write
    if (settingsSaveTimer.current) clearTimeout(settingsSaveTimer.current);
    settingsSaveTimer.current = setTimeout(() => {
      const toSave = { ...compilerSettings, mainFile: currentMainFile.current };
      fetch(`/api/projects/${encodeURIComponent(proj)}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: toSave }),
      }).catch(() => {/* best-effort */});
    }, 1500);
  }, [compilerSettings]);  

  const dragRail    = useCallback((dx: number) => setRailWidth(w    => clamp(w + dx,  80, 900)),  []);
  const dragPreview = useCallback((dx: number) => setPreviewWidth(w => clamp(w - dx, 150, 1100)), []);

  // Refs that survive re-renders for use in callbacks
  const autoCompileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentContent   = useRef<string>("");        // latest editor content (possibly unsaved)
  const currentFile      = useRef<string | null>(null);
  const currentProject   = useRef<string | null>(null);
  const currentMainFile  = useRef<string | null>(null);
  const settingsRef      = useRef(compilerSettings); // always latest settings in callbacks
  const saveFileRef      = useRef<((c: string) => Promise<void>) | null>(null); // set after handleSaveFile defined

  // Keep refs in sync
  useEffect(() => { currentProject.current  = project;  }, [project]);
  useEffect(() => { currentFile.current     = selectedFile; }, [selectedFile]);
  useEffect(() => { currentMainFile.current = mainFile; }, [mainFile]);
  useEffect(() => { settingsRef.current = compilerSettings; }, [compilerSettings]);

  // When mainFile changes, persist it into the project settings
  useEffect(() => {
    const proj = settingsProjectRef.current;
    if (!proj || !mainFile) return;
    if (settingsSaveTimer.current) clearTimeout(settingsSaveTimer.current);
    settingsSaveTimer.current = setTimeout(() => {
      const toSave = { ...settingsRef.current, mainFile };
      fetch(`/api/projects/${encodeURIComponent(proj)}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: toSave }),
      }).catch(() => {});
    }, 1500);
  }, [mainFile]);  

  // Reset compile state when project changes
  useEffect(() => {
    setCompileState("idle");
    setCompileLog("");
    setErrorCount(0);
    setWarningCount(0);
    setPdfKey(0);
    currentContent.current = "";
    // mainFile will be restored by the settings loader above if it was saved
    if (!project) setMainFile(null);
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
    body: JSON.stringify({ mainFile: mf, engine: settingsRef.current.engine, overrides }),
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

  // ── Auto-compile: debounce delay based on mode ───────────────────────────
  const scheduleAutoCompile = useCallback(() => {
    const mode = settingsRef.current.mode;
    if (mode === "manual" || mode === "interval") return;  // don't schedule
    const delay = mode === "live" ? 500 : 2000;            // live=500ms, debounced=2s
    if (autoCompileTimer.current) clearTimeout(autoCompileTimer.current);
    autoCompileTimer.current = setTimeout(() => {
      const proj = currentProject.current;
      const file = currentFile.current;
      if (!proj || !file || !file.endsWith(".tex")) return;
      const s = settingsRef.current;
      const relFile = file.startsWith(`${proj}/`) ? file.slice(proj.length + 1) : file;
      const compileFile = (s.compileTarget === "root" && s.rootFile) ? s.rootFile : relFile;
      compile(proj, compileFile, [{ path: relFile, content: currentContent.current }]);
    }, delay);
  }, [compile]);

  // ── Interval compile (fires every N seconds when mode=interval) ───────────
  useEffect(() => {
    if (compilerSettings.mode !== "interval") return;
    const id = setInterval(() => {
      const proj = currentProject.current;
      const file = currentFile.current;
      if (!proj || !file || !file.endsWith(".tex")) return;
      const s = settingsRef.current;
      const relFile = file.startsWith(`${proj}/`) ? file.slice(proj.length + 1) : file;
      const compileFile = (s.compileTarget === "root" && s.rootFile) ? s.rootFile : relFile;
      compile(proj, compileFile, [{ path: relFile, content: currentContent.current }]);
    }, compilerSettings.intervalSeconds * 1000);
    return () => clearInterval(id);
  }, [compile, compilerSettings.mode, compilerSettings.intervalSeconds]);

  // ── Manual compile (force, no debounce) ──────────────────────────────────
  const handleManualCompile = useCallback(() => {
    if (autoCompileTimer.current) clearTimeout(autoCompileTimer.current);
    const proj = currentProject.current;
    const mf   = currentMainFile.current;
    const file = currentFile.current;
    if (!proj || !mf) return;
    const s = settingsRef.current;
    const relMf = mf.startsWith(`${proj}/`) ? mf.slice(proj.length + 1) : mf;
    const relFile = file && file.startsWith(`${proj}/`) ? file.slice(proj.length + 1) : file;
    const compileFile = (s.compileTarget === "root" && s.rootFile) ? s.rootFile : relMf;
    compile(proj, compileFile, relFile ? [{ path: relFile, content: currentContent.current }] : []);
  }, [compile]);

  // ── Content change (every keystroke) ─────────────────────────────────────
  const handleContentChange = useCallback((content: string) => {
    currentContent.current = content;
    scheduleAutoCompile();
    // Auto-save debounce — use ref so we don't capture a stale handleSaveFile
    const secs = settingsRef.current.autoSaveSeconds;
    if (secs > 0) {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        saveFileRef.current?.(content);
      }, secs * 1000);
    }
  }, [scheduleAutoCompile]);

  // ── Download ──────────────────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    if (!project || !mainFile || pdfKey === 0) return;
    const s = settingsRef.current;
    const relMf = mainFile.startsWith(`${project}/`) ? mainFile.slice(project.length + 1) : mainFile;
    const targetFile = (s.compileTarget === "root" && s.rootFile) ? s.rootFile : relMf;

    const a = document.createElement("a");
    a.href = `/api/projects/${encodeURIComponent(project)}/pdf?mainFile=${encodeURIComponent(targetFile)}&download=1&t=${pdfKey}`;
    a.download = targetFile.replace(/\.tex$/, ".pdf").split("/").pop() || "document.pdf";
    a.click();
  }, [project, mainFile, pdfKey]);

  // ── Project select ────────────────────────────────────────────────────────
  const handleSelectProject = useCallback((name: string) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    if (autoCompileTimer.current) clearTimeout(autoCompileTimer.current);
    setProject(name);
    setSelectedFile(null);
    setFileContent("");
    setSaveState("idle");
    // Fire-and-forget: sync all project files to /tmp/oo-workspace for TexLab
    fetch(`/api/projects/${encodeURIComponent(name)}/sync-workspace`, { method: "POST" }).catch(() => {});
  }, []);

  // ── File open ─────────────────────────────────────────────────────────────
  const handleSelectFile = useCallback(async (filePath: string) => {
    if (!project) return;
    // Clear pending timers from previous file
    if (autoCompileTimer.current) clearTimeout(autoCompileTimer.current);
    if (autoSaveTimer.current)    clearTimeout(autoSaveTimer.current);

    setSelectedFile(filePath);
    setFileLoading(true);
    setFileContent("");
    currentContent.current = "";
    setMobileTab("editor");   // auto-navigate to editor on mobile

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

  // Keep save ref in sync so auto-save timer always calls the latest version
  useEffect(() => { saveFileRef.current = handleSaveFile; }, [handleSaveFile]);

  // ── Version restore ─────────────────────────────────────────────────────
  const handleRestore = useCallback(async (restoredContent: string, sha: string) => {
    if (!project || !selectedFile) return;
    // Save restored content to GitHub with a descriptive message
    setSaveState("saving");
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project)}/file`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: selectedFile,
          content: restoredContent,
          message: `Revert to ${sha.slice(0, 7)} via Open Overleaf`,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        // Update baseline content and force Editor remount to show restored version
        setFileContent(restoredContent);
        currentContent.current = restoredContent;
        setEditorRestoreKey(k => k + 1);
        setShowHistory(false);
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
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--quill-tertiary)", fontSize: "0.8125rem" }}
                >
                  Projects
                </button>
                <span className="breadcrumb-sep">/</span>
                <span className={selectedFile ? "" : "breadcrumb-active"}>{project}</span>
                {selectedFile && (
                  <>
                    <span className="breadcrumb-sep">/</span>
                    <span className="breadcrumb-active mono" style={{ fontSize: "0.8125rem" }}>
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
        data-tab={mobileTab}
        style={{ display: "flex", gridTemplateColumns: undefined, position: "relative" }}
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
                  style={{ fontSize: "0.8125rem", gap: 4 }}
                >
                  ← Projects
                </button>
                <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--quill-secondary)", fontFamily: "var(--font-mono)", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {project}
                </span>
              </div>
              <div className="panel-scroll" style={{ flex: 1 }}>
                <ProjectTree
                  project={project}
                  selectedFile={selectedFile}
                  onSelect={handleSelectFile}
                  rootFile={compilerSettings.rootFile}
                  onSetRootFile={(p) => setCompilerSettings(s => ({ ...s, rootFile: p }))}
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
              <span className="serif editor-empty-glyph loading-pulse" style={{ fontSize: "0.9375rem" }}>…</span>
              <p className="editor-empty-label">Loading file</p>
            </div>
          ) : selectedFile ? (
            <Editor
              key={`${selectedFile}-${editorRestoreKey}`}
              content={fileContent}
              onSave={handleSaveFile}
              onContentChange={handleContentChange}
              filename={filename}
              project={project ?? undefined}
              filePath={selectedFile ?? undefined}
            />
          ) : (
            <div className="editor-empty" style={{ flex: 1 }}>
              <span className="serif editor-empty-glyph" style={{ fontSize: "0.9375rem", color: "var(--rule-emphasis)", fontStyle: "italic" }}>
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
                <span className="status-item" style={{ color: "var(--quill-muted)", fontSize: "0.6875rem" }}>
                  ⌖ {mainFile}
                </span>
              )}
            </div>
            <div className="status-right">
              {selectedFile && (
                <button
                  title="View version history"
                  onClick={() => setShowHistory(h => !h)}
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: "0 4px",
                    color: showHistory ? "var(--lamp)" : "var(--quill-muted)",
                    fontSize: "0.6875rem", fontFamily: "var(--font-ui)",
                    display: "flex", alignItems: "center", gap: 3,
                    transition: "color 0.15s",
                  }}
                >
                  ◷ History
                </button>
              )}
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
          settings={compilerSettings}
          onSettingsChange={setCompilerSettings}
        />

        {/* ── Version history overlay — covers full body for wide diff view ── */}
        {showHistory && selectedFile && project && (
          <VersionHistory
            project={project}
            filePath={selectedFile}
            mainFile={mainFile}
            currentContent={fileContent}
            currentPdfSrc={
              project && mainFile && pdfKey > 0
                ? `/api/projects/${encodeURIComponent(project)}/pdf?mainFile=${encodeURIComponent(mainFile)}&t=${pdfKey}`
                : null
            }
            engine={compilerSettings.engine}
            onRestore={handleRestore}
            onClose={() => setShowHistory(false)}
          />
        )}
      </div>

      {/* ── Mobile navigation bar ── */}
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button
          className={`mobile-nav-btn${mobileTab === "files" ? " active" : ""}`}
          onClick={() => setMobileTab("files")}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
            <path d="M3 4h4l2 2h8v11H3z"/>
          </svg>
          Files
        </button>
        <button
          className={`mobile-nav-btn${mobileTab === "editor" ? " active" : ""}`}
          onClick={() => setMobileTab("editor")}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
            <polyline points="4,6 8,10 4,14"/>
            <line x1="10" y1="14" x2="16" y2="14"/>
          </svg>
          Editor
        </button>
        <button
          className={`mobile-nav-btn${mobileTab === "preview" ? " active" : ""}`}
          onClick={() => { setMobileTab("preview"); }}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
            <rect x="3" y="2" width="14" height="18" rx="1"/>
            <line x1="6" y1="7"  x2="14" y2="7"/>
            <line x1="6" y1="10" x2="14" y2="10"/>
            <line x1="6" y1="13" x2="10" y2="13"/>
          </svg>
          Preview
        </button>
      </nav>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
