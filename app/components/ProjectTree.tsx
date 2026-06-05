"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Entry  = { name: string; path: string; type: "file" | "dir" };
type CtxMenu = { entry: Entry; x: number; y: number } | null;
type Dialog  =
  | { type: "create"; parentPath: string; isFolder: boolean }
  | { type: "delete"; entry: Entry }
  | { type: "move";   entry: Entry }
  | null;

// ── VS Code–style file icons ───────────────────────────────────────────────────
const EXT_COLORS: Record<string, string> = {
  tex:  "#e5a344", bib:  "#4ec9b0", pdf:  "#f44747",
  png:  "#4dbb5f", jpg:  "#4dbb5f", jpeg: "#4dbb5f",
  gif:  "#4dbb5f", svg:  "#4dbb5f", cls:  "#c586c0",
  sty:  "#c586c0", md:   "#519aba", json: "#cbcb41",
  txt:  "#9cdcfe", toml: "#cbcb41", yaml: "#6abf69",
  yml:  "#6abf69",
};
const EXT_LABELS: Record<string, string> = {
  tex: "TeX", bib: "bib", pdf: "pdf",
  cls: "cls", sty: "sty", md: "md", json: "{}", txt: "txt",
};
const IMAGE_EXTS = new Set(["png","jpg","jpeg","gif","svg"]);

function FileIconSVG({ name }: { name: string }) {
  const ext   = name.split(".").pop()?.toLowerCase() ?? "";
  const color = EXT_COLORS[ext] ?? "#858585";
  const label = EXT_LABELS[ext];
  const isImg = IMAGE_EXTS.has(ext);

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0, display: "block" }}>
      <path d="M3 1.5h6.5l3 3v10H3z" fill={color} fillOpacity={0.15} stroke={color} strokeWidth={0.7}/>
      <path d="M9.5 1.5v3h3" fill="none" stroke={color} strokeWidth={0.7}/>
      {isImg ? (
        <>
          <circle cx="6.5" cy="7.5" r="1.2" fill={color} opacity={0.8}/>
          <path d="M4 11.5 L6.5 8.5 L9 11 L10.5 9 L12.5 11.5" stroke={color} strokeWidth={0.8} fill="none" strokeLinecap="round"/>
        </>
      ) : label ? (
        <text x="7.5" y="11.5" fontSize="3.5" textAnchor="middle"
          fill={color} fontFamily="monospace" fontWeight="700">
          {label}
        </text>
      ) : (
        <>
          <line x1="5" y1="8.5" x2="11" y2="8.5" stroke={color} strokeWidth={0.7} opacity={0.6}/>
          <line x1="5" y1="10.5" x2="9"  y2="10.5" stroke={color} strokeWidth={0.7} opacity={0.6}/>
        </>
      )}
    </svg>
  );
}

function FolderIconSVG({ open }: { open: boolean }) {
  const c = "#e8a448";
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0, display: "block" }}>
      {open ? (
        <>
          <path d="M1.5 6.5v7h13v-7z" fill={c} fillOpacity={0.28} stroke={c} strokeWidth={0.7}/>
          <path d="M1.5 6.5 L2.5 4 L6.5 4 L7.5 5.5 L14.5 5.5 L14.5 6.5z"
            fill={c} fillOpacity={0.6} stroke={c} strokeWidth={0.7}/>
        </>
      ) : (
        <>
          <path d="M1.5 5.5v8h13v-8z" fill={c} fillOpacity={0.22} stroke={c} strokeWidth={0.7}/>
          <path d="M1.5 4 L6 4 L7.5 5.5 L14.5 5.5 L14.5 5.5 L1.5 5.5z"
            fill={c} fillOpacity={0.55} stroke={c} strokeWidth={0.7}/>
        </>
      )}
    </svg>
  );
}

// Tiny SVG icons for toolbar buttons
function IconNewFile() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.1} strokeLinecap="round">
      <path d="M4 1.5h6l3 3v10H4z"/>
      <path d="M10 1.5v3h3"/>
      <line x1="11" y1="6.5" x2="11" y2="10.5" strokeWidth={1.5}/>
      <line x1="9"  y1="8.5" x2="13" y2="8.5"  strokeWidth={1.5}/>
    </svg>
  );
}
function IconNewFolder() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.1} strokeLinecap="round">
      <path d="M1.5 5.5v8h13v-8z"/>
      <path d="M1.5 4 L6 4 L7.5 5.5 L14.5 5.5"/>
      <line x1="11" y1="7"  x2="11" y2="11" strokeWidth={1.5}/>
      <line x1="9"  y1="9"  x2="13" y2="9"  strokeWidth={1.5}/>
    </svg>
  );
}
function IconRefresh() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round">
      <path d="M2.5 8A5.5 5.5 0 1 1 8 13.5"/>
      <polyline points="2.5,5 2.5,8 5.5,8"/>
    </svg>
  );
}
function IconChevronRight() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M3 2 L7 5 L3 8"/>
    </svg>
  );
}
function IconChevronDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M2 3 L5 7 L8 3"/>
    </svg>
  );
}
function IconSpinner() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" style={{ animation: "spin 0.7s linear infinite" }}>
      <path d="M5 1.5 A3.5 3.5 0 1 1 1.5 5"/>
    </svg>
  );
}

// ── Context menu ──────────────────────────────────────────────────────────────
function ContextMenu({ menu, onClose, onAction }: {
  menu: CtxMenu; onClose: () => void; onAction: (a: string) => void;
}) {
  useEffect(() => {
    const h  = (e: MouseEvent)    => { if (!(e.target as Element).closest(".ctx-menu")) onClose(); };
    const hk = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown",   hk);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", hk); };
  }, [onClose]);

  if (!menu) return null;
  const x = Math.min(menu.x, window.innerWidth  - 190);
  const y = Math.min(menu.y, window.innerHeight - 220);
  const isDir = menu.entry.type === "dir";

  const item = (label: string, action: string, danger = false) => (
    <div key={action} className="ctx-menu-item"
      style={danger ? { color: "var(--ink-danger)" } : {}}
      onMouseDown={(e) => { e.preventDefault(); onAction(action); onClose(); }}>
      {label}
    </div>
  );

  return (
    <div className="ctx-menu" style={{ left: x, top: y }}>
      {isDir && <>{item("New File",   "new-file")}{item("New Folder","new-folder")}<div className="ctx-menu-sep"/></>}
      {item("Rename (F2)", "rename")}
      {!isDir && item("Move to…", "move")}
      <div className="ctx-menu-sep"/>
      {item("Delete", "delete", true)}
    </div>
  );
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div style={{ position:"fixed",inset:0,zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",
      background:"rgba(0,0,0,0.5)",backdropFilter:"blur(2px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:"var(--ink-float)",border:"1px solid var(--rule-emphasis)",
        borderRadius:"var(--r-md)",padding:20,width:340,boxShadow:"0 24px 48px rgba(0,0,0,0.55)" }}>
        <div style={{ fontSize: "0.875rem",fontWeight:600,color:"var(--quill-primary)",marginBottom:14 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function ModalInput({ value, onChange, placeholder, onSubmit, hint }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; onSubmit: () => void; hint?: string;
}) {
  return (
    <>
      <input type="text" autoFocus value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
        style={{ width:"100%",padding:"7px 10px",background:"var(--ctrl-bg)",
          border:"1px solid var(--ctrl-border)",borderRadius:"var(--r-sm)",
          color:"var(--quill-primary)",fontSize: "0.875rem",fontFamily:"var(--font-mono)",outline:"none" }}
        onFocus={(e)  => (e.target.style.borderColor = "var(--rule-focus)")}
        onBlur={(e)   => (e.target.style.borderColor = "var(--ctrl-border)")}
      />
      {hint && <div style={{ marginTop:5,fontSize: "0.8125rem",color:"var(--quill-muted)" }}>{hint}</div>}
    </>
  );
}

function ModalActions({ onCancel, onConfirm, confirmLabel, danger=false, disabled=false }: {
  onCancel: () => void; onConfirm: () => void;
  confirmLabel: string; danger?: boolean; disabled?: boolean;
}) {
  return (
    <div style={{ display:"flex",gap:6,marginTop:14,justifyContent:"flex-end" }}>
      <button className="btn-sm btn-ghost" onClick={onCancel}>Cancel</button>
      <button className="btn-sm" onClick={onConfirm} disabled={disabled}
        style={danger
          ? { background:"var(--ink-danger-dim)",borderColor:"rgba(176,82,82,0.3)",color:"var(--ink-danger)" }
          : { background:"var(--lamp-dim)",borderColor:"rgba(200,169,110,0.3)",color:"var(--lamp)" }}>
        {confirmLabel}
      </button>
    </div>
  );
}

// ── Tree Item ─────────────────────────────────────────────────────────────────
interface TreeItemProps {
  entry: Entry;
  depth: number;
  project: string;
  expandedDirs: Set<string>;
  dirContents: Map<string, Entry[]>;
  loadingDirs: Set<string>;
  selectedFile: string | null;
  inlineRename: { path: string; value: string } | null;
  draggingPath: string | null;
  dragOverDir: string | null;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, entry: Entry) => void;
  onInlineRenameChange: (value: string) => void;
  onInlineRenameSubmit: () => void;
  onInlineRenameCancel: () => void;
  onDragStart: (path: string) => void;
  onDragEnd:   () => void;
  onDragEnterDir: (path: string) => void;
  onDragLeaveDir: () => void;
  onDropToDir: (dirPath: string) => void;
}

function TreeItem(props: TreeItemProps) {
  const {
    entry, depth, project,
    expandedDirs, dirContents, loadingDirs,
    selectedFile, inlineRename,
    draggingPath, dragOverDir,
    onToggleDir, onSelectFile, onContextMenu,
    onInlineRenameChange, onInlineRenameSubmit, onInlineRenameCancel,
    onDragStart, onDragEnd, onDragEnterDir, onDragLeaveDir, onDropToDir,
  } = props;

  const isDir      = entry.type === "dir";
  const isExpanded = expandedDirs.has(entry.path);
  const isLoading  = loadingDirs.has(entry.path);
  const isSelected = !isDir && selectedFile === entry.path;
  const isRenaming = inlineRename?.path === entry.path;
  const isDragging = draggingPath === entry.path;
  const isDragOver = isDir && dragOverDir === entry.path;
  const children   = dirContents.get(entry.path);
  const indent     = depth * 12;

  return (
    <>
      <div
        className={`tree-node${isSelected ? " active" : ""}${isDragOver ? " drag-over" : ""}`}
        style={{
          paddingLeft: indent + 4,
          opacity: isDragging ? 0.4 : 1,
          background: isDragOver ? "rgba(200,169,110,0.12)" : undefined,
          outline: isDragOver ? "1px dashed rgba(200,169,110,0.4)" : undefined,
        }}
        onClick={() => isDir ? onToggleDir(entry.path) : onSelectFile(entry.path)}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, entry); }}
        title={entry.path}
        /* Drag source (files only) */
        draggable={!isDir}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", entry.path);
          onDragStart(entry.path);
        }}
        onDragEnd={onDragEnd}
        /* Drop target (dirs only) */
        onDragOver={(e) => { if (isDir) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; onDragEnterDir(entry.path); } }}
        onDragLeave={() => { if (isDir) onDragLeaveDir(); }}
        onDrop={(e) => { e.preventDefault(); if (isDir) onDropToDir(entry.path); }}
      >
        {/* Chevron / spinner */}
        <span className="tree-chevron" style={{ color: "var(--quill-tertiary)" }}>
          {isDir ? (
            isLoading ? <IconSpinner/> : isExpanded ? <IconChevronDown/> : <IconChevronRight/>
          ) : (
            <span style={{ width: 10, display: "inline-block" }}/>
          )}
        </span>

        {/* Icon */}
        <span style={{ marginRight: 4 }}>
          {isDir ? <FolderIconSVG open={isExpanded}/> : <FileIconSVG name={entry.name}/>}
        </span>

        {/* Name or rename input */}
        {isRenaming ? (
          <input
            type="text" autoFocus
            value={inlineRename.value}
            onChange={(e) => onInlineRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")  onInlineRenameSubmit();
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

      {/* Children */}
      {isDir && isExpanded && children && children
        .filter((c) => c.name !== ".gitkeep")
        .map((child) => (
          <TreeItem key={child.path} {...props} entry={child} depth={depth + 1}/>
        ))
      }
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProjectTree({
  project, selectedFile, onSelect,
}: {
  project: string;
  selectedFile: string | null;
  onSelect: (path: string) => void;
}) {
  const [rootEntries, setRootEntries] = useState<Entry[] | null>(null);
  const [rootLoading, setRootLoading] = useState(true);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirContents,  setDirContents]  = useState<Map<string, Entry[]>>(new Map());
  const [loadingDirs,  setLoadingDirs]  = useState<Set<string>>(new Set());

  const [ctxMenu,       setCtxMenu]      = useState<CtxMenu>(null);
  const [dialog,        setDialog]       = useState<Dialog>(null);
  const [inlineRename,  setInlineRename] = useState<{ path: string; value: string } | null>(null);
  const [inputValue,    setInputValue]   = useState("");
  const [working,       setWorking]      = useState(false);
  const [opError,       setOpError]      = useState<string | null>(null);

  // Drag state
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [dragOverDir,  setDragOverDir]  = useState<string | null>(null);

  // ── Load root ──────────────────────────────────────────────────────────────
  const loadRoot = useCallback(async () => {
    setRootLoading(true);
    try {
      const res  = await fetch(`/api/projects/${encodeURIComponent(project)}/tree`);
      const data = await res.json();
      if (data.ok) setRootEntries(data.entries || []);
      else throw new Error(data.error);
    } catch (e: any) {
      console.error("Tree load:", e);
      setRootEntries([]);
    } finally { setRootLoading(false); }
  }, [project]);

  useEffect(() => { loadRoot(); }, [loadRoot]);

  // ── Load dir ───────────────────────────────────────────────────────────────
  const loadDir = useCallback(async (dirPath: string) => {
    setLoadingDirs((p) => new Set(p).add(dirPath));
    try {
      const res  = await fetch(`/api/projects/${encodeURIComponent(project)}/tree?path=${encodeURIComponent(dirPath)}`);
      const data = await res.json();
      if (data.ok) setDirContents((p) => new Map(p).set(dirPath, data.entries || []));
    } catch (e) { console.error("Dir load:", e); }
    finally {
      setLoadingDirs((p) => { const n = new Set(p); n.delete(dirPath); return n; });
    }
  }, [project]);

  // ── Toggle dir ─────────────────────────────────────────────────────────────
  const handleToggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) { next.delete(path); }
      else { next.add(path); if (!dirContents.has(path)) loadDir(path); }
      return next;
    });
  }, [dirContents, loadDir]);

  // ── Refresh ────────────────────────────────────────────────────────────────
  const refreshTree = useCallback(async () => {
    await loadRoot();
    for (const d of expandedDirs) await loadDir(d);
  }, [loadRoot, loadDir, expandedDirs]);

  // ── Context menu ───────────────────────────────────────────────────────────
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
      setInputValue(""); setDialog({ type: "create", parentPath: entry.path, isFolder: false });
    } else if (action === "new-folder") {
      setInputValue(""); setDialog({ type: "create", parentPath: entry.path, isFolder: true });
    } else if (action === "delete") {
      setDialog({ type: "delete", entry });
    } else if (action === "move") {
      setInputValue(entry.path); setDialog({ type: "move", entry });
    }
  }, [ctxMenu]);

  // ── Inline rename ──────────────────────────────────────────────────────────
  const submitInlineRename = useCallback(async () => {
    if (!inlineRename?.value.trim()) { setInlineRename(null); return; }
    const parts = inlineRename.path.split("/");
    parts[parts.length - 1] = inlineRename.value.trim();
    const newPath = parts.join("/");
    if (newPath === inlineRename.path) { setInlineRename(null); return; }
    setWorking(true);
    try {
      const res  = await fetch(`/api/projects/${encodeURIComponent(project)}/rename`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: inlineRename.path, to: newPath }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Rename failed");
      setInlineRename(null); await refreshTree();
    } catch (e: any) { setOpError(e.message); setInlineRename(null); }
    finally { setWorking(false); }
  }, [inlineRename, project, refreshTree]);

  // F2 rename
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "F2" && selectedFile && !inlineRename) {
        const name = selectedFile.split("/").pop() || selectedFile;
        setInlineRename({ path: selectedFile, value: name });
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selectedFile, inlineRename]);

  // ── Create ─────────────────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!inputValue.trim() || dialog?.type !== "create") return;
    const parent = (dialog as any).parentPath as string;
    const isFolder = (dialog as any).isFolder as boolean;
    const path = parent ? `${parent}/${inputValue.trim()}` : inputValue.trim();
    setWorking(true); setOpError(null);
    try {
      const res  = await fetch(`/api/projects/${encodeURIComponent(project)}/file`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, isFolder }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      setDialog(null); await refreshTree();
    } catch (e: any) { setOpError(e.message); }
    finally { setWorking(false); }
  }, [inputValue, dialog, project, refreshTree]);

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (dialog?.type !== "delete") return;
    const entry = dialog.entry;
    setWorking(true); setOpError(null);
    try {
      const tp  = entry.type === "dir" ? "&type=dir" : "&type=file";
      const res  = await fetch(
        `/api/projects/${encodeURIComponent(project)}/file?path=${encodeURIComponent(entry.path)}${tp}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      setDialog(null);
      const dp = entry.path;
      setExpandedDirs((p) => { const n = new Set(p); for (const x of p) if (x===dp||x.startsWith(dp+"/")) n.delete(x); return n; });
      setDirContents((p)  => { const n = new Map(p); for (const x of p.keys()) if (x===dp||x.startsWith(dp+"/")) n.delete(x); return n; });
      await refreshTree();
    } catch (e: any) { setOpError(e.message); }
    finally { setWorking(false); }
  }, [dialog, project, refreshTree]);

  // ── Move (dialog) ──────────────────────────────────────────────────────────
  const handleMove = useCallback(async () => {
    if (dialog?.type !== "move" || !inputValue.trim()) return;
    const oldPath = dialog.entry.path;
    setWorking(true); setOpError(null);
    try {
      const res  = await fetch(`/api/projects/${encodeURIComponent(project)}/rename`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: oldPath, to: inputValue.trim() }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
      setDialog(null); await refreshTree();
    } catch (e: any) { setOpError(e.message); }
    finally { setWorking(false); }
  }, [dialog, inputValue, project, refreshTree]);

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  const handleDragStart   = useCallback((path: string) => setDraggingPath(path), []);
  const handleDragEnd     = useCallback(() => { setDraggingPath(null); setDragOverDir(null); }, []);
  const handleDragEnterDir = useCallback((path: string) => setDragOverDir(path), []);
  const handleDragLeaveDir = useCallback(() => setDragOverDir(null), []);

  const handleDropToDir = useCallback(async (dirPath: string) => {
    const fromPath = draggingPath;
    setDraggingPath(null); setDragOverDir(null);
    if (!fromPath) return;
    const fileName = fromPath.split("/").pop()!;
    const toPath   = dirPath ? `${dirPath}/${fileName}` : fileName;
    if (toPath === fromPath) return;
    setOpError(null);
    try {
      const res  = await fetch(`/api/projects/${encodeURIComponent(project)}/rename`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromPath, to: toPath }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Move failed");
      await refreshTree();
    } catch (e: any) { setOpError(e.message); }
  }, [draggingPath, project, refreshTree]);

  // ── Select guard ───────────────────────────────────────────────────────────
  const handleSelectFile = useCallback((path: string) => {
    const all = [...(rootEntries||[]), ...Array.from(dirContents.values()).flat()];
    if (all.find((e) => e.path === path)?.type === "dir") return;
    onSelect(path);
  }, [rootEntries, dirContents, onSelect]);

  // ── Shared TreeItem props ──────────────────────────────────────────────────
  const sharedProps = {
    project, expandedDirs, dirContents, loadingDirs, selectedFile, inlineRename,
    draggingPath, dragOverDir,
    onToggleDir: handleToggleDir,
    onSelectFile: handleSelectFile,
    onContextMenu: handleContextMenu,
    onInlineRenameChange: (v: string) => setInlineRename((r) => r ? { ...r, value: v } : null),
    onInlineRenameSubmit: submitInlineRename,
    onInlineRenameCancel: () => setInlineRename(null),
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onDragEnterDir: handleDragEnterDir,
    onDragLeaveDir: handleDragLeaveDir,
    onDropToDir: handleDropToDir,
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", userSelect: "none" }}>

      {/* ── VS Code–style header toolbar ── */}
      <div style={{
        display: "flex", alignItems: "center",
        padding: "4px 8px 4px 10px",
        borderBottom: "1px solid var(--rule-faint)",
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "var(--quill-tertiary)", flex: 1,
        }}>
          Explorer
        </span>

        <button className="icon-btn" title="New File"
          onClick={() => { setInputValue(""); setDialog({ type: "create", parentPath: "", isFolder: false }); }}>
          <IconNewFile/>
        </button>
        <button className="icon-btn" title="New Folder"
          onClick={() => { setInputValue(""); setDialog({ type: "create", parentPath: "", isFolder: true }); }}>
          <IconNewFolder/>
        </button>
        <button className="icon-btn" title="Refresh" onClick={refreshTree}>
          <IconRefresh/>
        </button>
      </div>

      {/* ── Tree ── */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", fontSize: "0.875rem" }}>
        {rootLoading ? (
          <div style={{ padding: "8px 0" }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{ display:"flex",alignItems:"center",gap:6,padding:"5px 12px" }}>
                <div className="skeleton" style={{ width:10,height:10,borderRadius:2 }}/>
                <div className="skeleton" style={{ height:9,width:`${50+i*10}%`,borderRadius:2 }}/>
              </div>
            ))}
          </div>
        ) : !rootEntries || rootEntries.length === 0 ? (
          <div style={{ padding:"14px 12px",color:"var(--quill-muted)",fontSize: "0.8125rem" }}>
            Empty project — use the icons above to add files.
          </div>
        ) : (
          rootEntries
            .filter((e) => e.name !== ".gitkeep")
            .map((entry) => (
              <TreeItem key={entry.path} entry={entry} depth={0} {...sharedProps}/>
            ))
        )}
      </div>

      {/* ── Error banner ── */}
      {opError && (
        <div style={{
          margin:"4px 8px",padding:"6px 10px",
          background:"var(--ink-danger-dim)",border:"1px solid rgba(176,82,82,0.25)",
          borderRadius:"var(--r-sm)",fontSize: "0.8125rem",color:"var(--ink-danger)",
          display:"flex",gap:8,justifyContent:"space-between",flexShrink:0,
        }}>
          <span>{opError}</span>
          <button onClick={() => setOpError(null)}
            style={{ background:"none",border:"none",color:"var(--ink-danger)",cursor:"pointer",fontSize: "0.875rem" }}>
            ✕
          </button>
        </div>
      )}

      {/* ── Context menu ── */}
      <ContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} onAction={handleCtxAction}/>

      {/* ── Create dialog ── */}
      {dialog?.type === "create" && (
        <Modal title={(dialog as any).isFolder ? "New Folder" : "New File"} onClose={() => setDialog(null)}>
          <ModalInput value={inputValue} onChange={setInputValue}
            placeholder={(dialog as any).isFolder ? "folder-name" : "filename.tex"}
            onSubmit={handleCreate}
            hint={(dialog as any).parentPath ? `Inside: ${(dialog as any).parentPath}/` : ""}
          />
          {opError && <div style={{ marginTop:8,fontSize: "0.8125rem",color:"var(--ink-danger)" }}>{opError}</div>}
          <ModalActions onCancel={() => setDialog(null)} onConfirm={handleCreate}
            confirmLabel={working ? "Creating…" : (dialog as any).isFolder ? "Create Folder" : "Create File"}
            disabled={working || !inputValue.trim()}
          />
        </Modal>
      )}

      {/* ── Delete dialog ── */}
      {dialog?.type === "delete" && (
        <Modal title={`Delete "${dialog.entry.name}"`} onClose={() => setDialog(null)}>
          <p style={{ fontSize: "0.875rem",color:"var(--quill-secondary)",lineHeight:1.6 }}>
            {dialog.entry.type === "dir"
              ? <><strong>Recursively deletes</strong> all files inside <code>{dialog.entry.name}</code>. Cannot be undone.</>
              : <>Permanently deletes <code>{dialog.entry.name}</code> from GitHub. Cannot be undone.</>}
          </p>
          {opError && <div style={{ marginTop:8,fontSize: "0.8125rem",color:"var(--ink-danger)" }}>{opError}</div>}
          <ModalActions onCancel={() => setDialog(null)} onConfirm={handleDelete}
            confirmLabel={working ? "Deleting…" : "Delete permanently"} danger disabled={working}/>
        </Modal>
      )}

      {/* ── Move dialog ── */}
      {dialog?.type === "move" && (
        <Modal title={`Move "${dialog.entry.name}"`} onClose={() => setDialog(null)}>
          <div style={{ fontSize: "0.8125rem",color:"var(--quill-tertiary)",marginBottom:8 }}>New path (relative to project root):</div>
          <ModalInput value={inputValue} onChange={setInputValue}
            placeholder="chapters/newname.tex" onSubmit={handleMove}/>
          {opError && <div style={{ marginTop:8,fontSize: "0.8125rem",color:"var(--ink-danger)" }}>{opError}</div>}
          <ModalActions onCancel={() => setDialog(null)} onConfirm={handleMove}
            confirmLabel={working ? "Moving…" : "Move"} disabled={working || !inputValue.trim()}/>
        </Modal>
      )}
    </div>
  );
}
