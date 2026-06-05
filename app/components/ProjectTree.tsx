"use client";

import {
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Entry = { name: string; path: string; type: "file" | "dir" };

type CtxMenu = { entry: Entry; x: number; y: number } | null;

type Dialog =
  | { type: "create"; parentPath: string; isFolder: boolean }
  | { type: "delete"; entry: Entry }
  | { type: "move"; entry: Entry }
  | null;

// ── File icons ────────────────────────────────────────────────────────────────
function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const iconMap: Record<string, { glyph: string; color: string }> = {
    tex:  { glyph: "§",  color: "#c8a96e" },
    bib:  { glyph: "⊕",  color: "#6eadc8" },
    pdf:  { glyph: "□",  color: "#b05252" },
    svg:  { glyph: "◈",  color: "#6ec87a" },
    png:  { glyph: "◈",  color: "#6ec87a" },
    jpg:  { glyph: "◈",  color: "#6ec87a" },
    jpeg: { glyph: "◈",  color: "#6ec87a" },
    cls:  { glyph: "∑",  color: "#9e78c8" },
    sty:  { glyph: "∑",  color: "#9e78c8" },
    md:   { glyph: "¶",  color: "#78c8b4" },
    json: { glyph: "{}",  color: "#c8b478" },
  };
  const icon = iconMap[ext] || { glyph: "·", color: "var(--quill-muted)" };
  return (
    <span style={{
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      color: icon.color,
      width: 16,
      textAlign: "center",
      flexShrink: 0,
      display: "inline-block",
    }}>
      {icon.glyph}
    </span>
  );
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <span style={{
      fontSize: 12,
      color: "var(--lamp)",
      width: 16,
      textAlign: "center",
      flexShrink: 0,
      display: "inline-block",
      opacity: 0.85,
    }}>
      {open ? "▾" : "▸"}
    </span>
  );
}

// ── Context menu ──────────────────────────────────────────────────────────────
function ContextMenu({
  menu,
  onClose,
  onAction,
}: {
  menu: CtxMenu;
  onClose: () => void;
  onAction: (action: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isDir = menu?.entry.type === "dir";

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  if (!menu) return null;

  // Clamp to viewport
  const x = Math.min(menu.x, window.innerWidth - 180);
  const y = Math.min(menu.y, window.innerHeight - 200);

  const item = (label: string, action: string, danger = false) => (
    <div
      key={action}
      className="ctx-menu-item"
      style={danger ? { color: "var(--ink-danger)" } : {}}
      onMouseDown={(e) => { e.preventDefault(); onAction(action); onClose(); }}
    >
      {label}
    </div>
  );

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ left: x, top: y }}
    >
      {isDir && <>
        {item("New File",   "new-file")}
        {item("New Folder", "new-folder")}
        <div className="ctx-menu-sep" />
      </>}
      {item("Rename (F2)", "rename")}
      {!isDir && item("Move to…", "move")}
      <div className="ctx-menu-sep" />
      {item("Delete", "delete", true)}
    </div>
  );
}

// ── Modal dialog ──────────────────────────────────────────────────────────────
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 900,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--ink-float)",
        border: "1px solid var(--rule-emphasis)",
        borderRadius: "var(--r-md)",
        padding: "20px",
        width: 340,
        boxShadow: "0 24px 48px rgba(0,0,0,0.55)",
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--quill-primary)", marginBottom: 14 }}>
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalInput({
  value, onChange, placeholder, onSubmit, hint,
}: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; onSubmit: () => void; hint?: string;
}) {
  return (
    <>
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
        style={{
          width: "100%", padding: "7px 10px",
          background: "var(--ctrl-bg)", border: "1px solid var(--ctrl-border)",
          borderRadius: "var(--r-sm)", color: "var(--quill-primary)",
          fontSize: 13, fontFamily: "var(--font-mono)", outline: "none",
        }}
        onFocus={(e) => (e.target.style.borderColor = "var(--rule-focus)")}
        onBlur={(e) => (e.target.style.borderColor = "var(--ctrl-border)")}
      />
      {hint && <div style={{ marginTop: 5, fontSize: 12, color: "var(--quill-muted)" }}>{hint}</div>}
    </>
  );
}

function ModalActions({
  onCancel, onConfirm, confirmLabel, danger = false, disabled = false,
}: {
  onCancel: () => void; onConfirm: () => void;
  confirmLabel: string; danger?: boolean; disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 14, justifyContent: "flex-end" }}>
      <button className="btn-sm btn-ghost" onClick={onCancel}>Cancel</button>
      <button
        className="btn-sm"
        onClick={onConfirm}
        disabled={disabled}
        style={danger ? {
          background: "var(--ink-danger-dim)",
          borderColor: "rgba(176,82,82,0.3)",
          color: "var(--ink-danger)",
        } : {
          background: "var(--lamp-dim)",
          borderColor: "rgba(200,169,110,0.3)",
          color: "var(--lamp)",
        }}
      >
        {confirmLabel}
      </button>
    </div>
  );
}

// ── Tree Item (recursive) ─────────────────────────────────────────────────────
interface TreeItemProps {
  entry: Entry;
  depth: number;
  project: string;
  expandedDirs: Set<string>;
  dirContents: Map<string, Entry[]>;
  loadingDirs: Set<string>;
  selectedFile: string | null;
  inlineRename: { path: string; value: string } | null;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, entry: Entry) => void;
  onInlineRenameChange: (value: string) => void;
  onInlineRenameSubmit: () => void;
  onInlineRenameCancel: () => void;
}

function TreeItem({
  entry, depth, project,
  expandedDirs, dirContents, loadingDirs,
  selectedFile, inlineRename,
  onToggleDir, onSelectFile, onContextMenu,
  onInlineRenameChange, onInlineRenameSubmit, onInlineRenameCancel,
}: TreeItemProps) {
  const isDir = entry.type === "dir";
  const isExpanded = expandedDirs.has(entry.path);
  const isLoading = loadingDirs.has(entry.path);
  const isSelected = !isDir && selectedFile === entry.path;
  const isRenaming = inlineRename?.path === entry.path;
  const children = dirContents.get(entry.path);

  const indent = depth * 16;

  return (
    <>
      <div
        className={`tree-node ${isSelected ? "active" : ""}`}
        style={{ paddingLeft: indent + 6 }}
        onClick={() => isDir ? onToggleDir(entry.path) : onSelectFile(entry.path)}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, entry); }}
        title={entry.path}
      >
        {/* Chevron (dirs) or spacer (files) */}
        {isDir ? (
          <span className="tree-chevron">
            {isLoading ? (
              <span style={{ fontSize: 10, animation: "compile-spin 0.8s linear infinite", display: "inline-block" }}>⟳</span>
            ) : (
              isExpanded ? "▾" : "▸"
            )}
          </span>
        ) : (
          <span style={{ width: 16, display: "inline-block", flexShrink: 0 }} />
        )}

        {/* Icon */}
        {isDir ? <FolderIcon open={isExpanded} /> : <FileIcon name={entry.name} />}

        {/* Name or inline rename input */}
        {isRenaming ? (
          <input
            type="text"
            autoFocus
            value={inlineRename.value}
            onChange={(e) => onInlineRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onInlineRenameSubmit();
              if (e.key === "Escape") onInlineRenameCancel();
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            className="tree-rename-input"
          />
        ) : (
          <span className="tree-name">{entry.name}</span>
        )}
      </div>

      {/* Children (if expanded) */}
      {isDir && isExpanded && children && children
        .filter((child) => child.name !== ".gitkeep")
        .map((child) => (
        <TreeItem
          key={child.path}
          entry={child}
          depth={depth + 1}
          project={project}
          expandedDirs={expandedDirs}
          dirContents={dirContents}
          loadingDirs={loadingDirs}
          selectedFile={selectedFile}
          inlineRename={inlineRename}
          onToggleDir={onToggleDir}
          onSelectFile={onSelectFile}
          onContextMenu={onContextMenu}
          onInlineRenameChange={onInlineRenameChange}
          onInlineRenameSubmit={onInlineRenameSubmit}
          onInlineRenameCancel={onInlineRenameCancel}
        />
      ))}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProjectTree({
  project,
  selectedFile,
  onSelect,
}: {
  project: string;
  selectedFile: string | null;
  onSelect: (path: string) => void;
}) {
  // Tree state
  const [rootEntries, setRootEntries] = useState<Entry[] | null>(null);
  const [rootLoading, setRootLoading] = useState(true);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirContents, setDirContents] = useState<Map<string, Entry[]>>(new Map());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());

  // Context menu + dialogs
  const [ctxMenu, setCtxMenu] = useState<CtxMenu>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [inlineRename, setInlineRename] = useState<{ path: string; value: string } | null>(null);

  // Dialog input state
  const [inputValue, setInputValue] = useState("");
  const [working, setWorking] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);

  // ── Load root entries ───────────────────────────────────────────────────────
  const loadRoot = useCallback(async () => {
    setRootLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project)}/tree`);
      const data = await res.json();
      if (data.ok) setRootEntries(data.entries || []);
      else throw new Error(data.error);
    } catch (e: any) {
      console.error("Tree load error:", e);
      setRootEntries([]);
    } finally {
      setRootLoading(false);
    }
  }, [project]);

  useEffect(() => { loadRoot(); }, [loadRoot]);

  // ── Load a subdirectory ─────────────────────────────────────────────────────
  const loadDir = useCallback(async (dirPath: string) => {
    setLoadingDirs((prev) => new Set(prev).add(dirPath));
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(project)}/tree?path=${encodeURIComponent(dirPath)}`
      );
      const data = await res.json();
      if (data.ok) {
        setDirContents((prev) => new Map(prev).set(dirPath, data.entries || []));
      }
    } catch (e) {
      console.error("Dir load error:", e);
    } finally {
      setLoadingDirs((prev) => {
        const next = new Set(prev);
        next.delete(dirPath);
        return next;
      });
    }
  }, [project]);

  // ── Toggle directory ────────────────────────────────────────────────────────
  const handleToggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        // Lazy-load if not yet fetched
        if (!dirContents.has(path)) {
          loadDir(path);
        }
      }
      return next;
    });
  }, [dirContents, loadDir]);

  // ── Refresh tree (after operations) ────────────────────────────────────────
  const refreshTree = useCallback(async () => {
    // Reload root
    await loadRoot();
    // Reload all expanded dirs
    for (const dirPath of expandedDirs) {
      await loadDir(dirPath);
    }
  }, [loadRoot, loadDir, expandedDirs]);

  // ── Context menu ────────────────────────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent, entry: Entry) => {
    setCtxMenu({ entry, x: e.clientX, y: e.clientY });
  }, []);

  const handleCtxAction = useCallback((action: string) => {
    const entry = ctxMenu?.entry;
    if (!entry) return;
    setOpError(null);

    if (action === "rename") {
      setInlineRename({ path: entry.path, value: entry.name });
    } else if (action === "new-file") {
      setInputValue("");
      setDialog({ type: "create", parentPath: entry.path, isFolder: false });
    } else if (action === "new-folder") {
      setInputValue("");
      setDialog({ type: "create", parentPath: entry.path, isFolder: true });
    } else if (action === "delete") {
      setDialog({ type: "delete", entry });
    } else if (action === "move") {
      setInputValue(entry.path);
      setDialog({ type: "move", entry });
    }
  }, [ctxMenu]);

  // ── Inline rename ───────────────────────────────────────────────────────────
  const submitInlineRename = useCallback(async () => {
    if (!inlineRename || !inlineRename.value.trim()) {
      setInlineRename(null);
      return;
    }
    const oldPath = inlineRename.path;
    const parts = oldPath.split("/");
    parts[parts.length - 1] = inlineRename.value.trim();
    const newPath = parts.join("/");
    if (newPath === oldPath) { setInlineRename(null); return; }

    setWorking(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project)}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: oldPath, to: newPath }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Rename failed");
      setInlineRename(null);
      await refreshTree();
    } catch (e: any) {
      setOpError(e.message);
      setInlineRename(null);
    } finally {
      setWorking(false);
    }
  }, [inlineRename, project, refreshTree]);

  // ── F2 key handler for rename ───────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F2" && selectedFile && !inlineRename) {
        const name = selectedFile.split("/").pop() || selectedFile;
        setInlineRename({ path: selectedFile, value: name });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedFile, inlineRename]);

  // ── Create file / folder ────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!inputValue.trim() || dialog?.type !== "create") return;
    const parentPath = (dialog as any).parentPath as string;
    const isFolder = (dialog as any).isFolder as boolean;
    const relativePath = parentPath ? `${parentPath}/${inputValue.trim()}` : inputValue.trim();
    setWorking(true);
    setOpError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project)}/file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: relativePath, isFolder }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      setDialog(null);
      await refreshTree();
    } catch (e: any) {
      setOpError(e.message);
    } finally {
      setWorking(false);
    }
  }, [inputValue, dialog, project, refreshTree]);

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (dialog?.type !== "delete") return;
    const entry = dialog.entry;
    setWorking(true);
    setOpError(null);
    try {
      // Pass ?type=dir for folders so the API does recursive deletion
      const typeParam = entry.type === "dir" ? "&type=dir" : "&type=file";
      const res = await fetch(
        `/api/projects/${encodeURIComponent(project)}/file?path=${encodeURIComponent(entry.path)}${typeParam}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      setDialog(null);

      // Remove deleted path (and all descendants) from expanded/cached state
      // so the tree doesn't try to re-fetch a now-deleted folder
      const deletedPath = entry.path;
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        for (const p of prev) {
          if (p === deletedPath || p.startsWith(deletedPath + "/")) next.delete(p);
        }
        return next;
      });
      setDirContents((prev) => {
        const next = new Map(prev);
        for (const p of prev.keys()) {
          if (p === deletedPath || p.startsWith(deletedPath + "/")) next.delete(p);
        }
        return next;
      });

      await refreshTree();
    } catch (e: any) {
      setOpError(e.message);
    } finally {
      setWorking(false);
    }
  }, [dialog, project, refreshTree]);

  // ── Move ────────────────────────────────────────────────────────────────────
  const handleMove = useCallback(async () => {
    if (dialog?.type !== "move" || !inputValue.trim()) return;
    const oldPath = dialog.entry.path;
    setWorking(true);
    setOpError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project)}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: oldPath, to: inputValue.trim() }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      setDialog(null);
      await refreshTree();
    } catch (e: any) {
      setOpError(e.message);
    } finally {
      setWorking(false);
    }
  }, [dialog, inputValue, project, refreshTree]);

  // ── Render ──────────────────────────────────────────────────────────────────
  // Guard: don't open directories as files
  const handleSelectFile = useCallback((path: string) => {
    const allEntries = [
      ...(rootEntries || []),
      ...Array.from(dirContents.values()).flat(),
    ];
    const entry = allEntries.find(e => e.path === path);
    if (entry?.type === "dir") return;
    onSelect(path);
  }, [rootEntries, dirContents, onSelect]);

  const treeItemProps = {
    project, expandedDirs, dirContents, loadingDirs, selectedFile, inlineRename,
    onToggleDir: handleToggleDir,
    onSelectFile: handleSelectFile,
    onContextMenu: handleContextMenu,
    onInlineRenameChange: (v: string) => setInlineRename((r) => r ? { ...r, value: v } : null),
    onInlineRenameSubmit: submitInlineRename,
    onInlineRenameCancel: () => setInlineRename(null),
  };

  return (
    <div style={{ userSelect: "none", fontSize: 14 }}>
      {/* ── Tree contents ── */}
      {rootLoading ? (
        <div style={{ padding: "8px 0" }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px" }}>
              <div className="skeleton" style={{ width: 10, height: 10, borderRadius: 2 }} />
              <div className="skeleton" style={{ height: 9, width: `${50 + i * 10}%`, borderRadius: 2 }} />
            </div>
          ))}
        </div>
      ) : !rootEntries || rootEntries.length === 0 ? (
        <div style={{ padding: "12px 12px 8px", color: "var(--quill-muted)", fontSize: 13 }}>
          Empty project
        </div>
      ) : (
        rootEntries
          .filter((e) => e.name !== ".gitkeep")
          .map((entry) => (
            <TreeItem key={entry.path} entry={entry} depth={0} {...treeItemProps} />
          ))
      )}

      {/* ── Bottom toolbar: New File / New Folder ── */}
      <div style={{
        display: "flex", gap: 4, padding: "6px 10px",
        borderTop: "1px solid var(--rule-faint)", marginTop: 4,
      }}>
        <button
          className="btn-sm"
          style={{ flex: 1, fontSize: 12 }}
          onClick={() => { setInputValue(""); setDialog({ type: "create", parentPath: "", isFolder: false }); }}
        >
          + File
        </button>
        <button
          className="btn-sm"
          style={{ flex: 1, fontSize: 12 }}
          onClick={() => { setInputValue(""); setDialog({ type: "create", parentPath: "", isFolder: true }); }}
        >
          + Folder
        </button>
        <button
          className="btn-sm btn-ghost"
          style={{ fontSize: 12, padding: "4px 8px" }}
          onClick={refreshTree}
          title="Refresh"
        >
          ↺
        </button>
      </div>

      {/* ── Error banner ── */}
      {opError && (
        <div style={{
          margin: "4px 10px 6px",
          padding: "7px 10px",
          background: "var(--ink-danger-dim)",
          border: "1px solid rgba(176,82,82,0.25)",
          borderRadius: "var(--r-sm)",
          fontSize: 12,
          color: "var(--ink-danger)",
          display: "flex", gap: 8, justifyContent: "space-between",
        }}>
          <span>{opError}</span>
          <button
            onClick={() => setOpError(null)}
            style={{ background: "none", border: "none", color: "var(--ink-danger)", cursor: "pointer", fontSize: 13 }}
          >✕</button>
        </div>
      )}

      {/* ── Context menu ── */}
      <ContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} onAction={handleCtxAction} />

      {/* ── Create dialog ── */}
      {dialog?.type === "create" && (
        <Modal
          title={(dialog as any).isFolder ? "New Folder" : "New File"}
          onClose={() => setDialog(null)}
        >
          <ModalInput
            value={inputValue}
            onChange={setInputValue}
            placeholder={(dialog as any).isFolder ? "folder-name" : "filename.tex"}
            onSubmit={handleCreate}
            hint={(dialog as any).parentPath ? `Inside: ${(dialog as any).parentPath}/` : ""}
          />
          {opError && <div style={{ marginTop: 8, fontSize: 12, color: "var(--ink-danger)" }}>{opError}</div>}
          <ModalActions
            onCancel={() => setDialog(null)}
            onConfirm={handleCreate}
            confirmLabel={working ? "Creating…" : (dialog as any).isFolder ? "Create Folder" : "Create File"}
            disabled={working || !inputValue.trim()}
          />
        </Modal>
      )}

      {/* ── Delete dialog ── */}
      {dialog?.type === "delete" && (
        <Modal title={`Delete "${dialog.entry.name}"`} onClose={() => setDialog(null)}>
          <p style={{ fontSize: 13, color: "var(--quill-secondary)", lineHeight: 1.6 }}>
            {dialog.entry.type === "dir"
              ? <>This will <strong>recursively delete</strong> all files inside <code>{dialog.entry.name}</code> from GitHub. This cannot be undone.</>
              : <>This permanently deletes <code>{dialog.entry.name}</code> from GitHub. This cannot be undone.</>
            }
          </p>
          {opError && <div style={{ marginTop: 8, fontSize: 12, color: "var(--ink-danger)" }}>{opError}</div>}
          <ModalActions
            onCancel={() => setDialog(null)}
            onConfirm={handleDelete}
            confirmLabel={working ? "Deleting…" : "Delete permanently"}
            danger
            disabled={working}
          />
        </Modal>
      )}

      {/* ── Move dialog ── */}
      {dialog?.type === "move" && (
        <Modal title={`Move "${dialog.entry.name}"`} onClose={() => setDialog(null)}>
          <div style={{ fontSize: 12, color: "var(--quill-tertiary)", marginBottom: 8 }}>
            New path relative to project root:
          </div>
          <ModalInput
            value={inputValue}
            onChange={setInputValue}
            placeholder="chapters/newname.tex"
            onSubmit={handleMove}
          />
          {opError && <div style={{ marginTop: 8, fontSize: 12, color: "var(--ink-danger)" }}>{opError}</div>}
          <ModalActions
            onCancel={() => setDialog(null)}
            onConfirm={handleMove}
            confirmLabel={working ? "Moving…" : "Move"}
            disabled={working || !inputValue.trim()}
          />
        </Modal>
      )}
    </div>
  );
}
