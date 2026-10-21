"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Entry  = { name: string; path: string; type: "file" | "dir" };
type CtxMenu = { entry: Entry; x: number; y: number; isMulti?: boolean } | null;
type Dialog  =
  | { type: "create"; parentPath: string; isFolder: boolean }
  | { type: "delete"; entry: Entry }
  | { type: "move";   entry: Entry }
  | { type: "batch-delete"; paths: string[] }
  | { type: "batch-move";   paths: string[] }
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
function IconUpload() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 10.5v2.5h11v-2.5"/>
      <path d="M8 9.5V3"/>
      <path d="M5 5.5L8 3L11 5.5"/>
    </svg>
  );
}
function IconUploadFolder() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 6v6.5h13V6"/>
      <path d="M1.5 4L6 4L7.5 5.5L14.5 5.5V6"/>
      <path d="M8 10V5.5"/>
      <path d="M5.5 7.5L8 5.5L10.5 7.5"/>
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
function IconChecklist() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round">
      <polyline points="2.5,5 4,6.5 7,3"/>
      <path d="M8.5 4.5h5M8.5 8.5h5M8.5 12.5h5"/>
      <polyline points="2.5,12 4,13.5 7,10"/>
    </svg>
  );
}

// Helper: collect flat list of visible entries in tree order for Shift+click range selection
function getVisibleEntries(
  roots: Entry[] | null,
  expanded: Set<string>,
  contents: Map<string, Entry[]>
): Entry[] {
  if (!roots) return [];
  const list: Entry[] = [];
  function traverse(entries: Entry[]) {
    for (const entry of entries) {
      if (entry.name === ".gitkeep") continue;
      list.push(entry);
      if (entry.type === "dir" && expanded.has(entry.path)) {
        const children = contents.get(entry.path);
        if (children) traverse(children);
      }
    }
  }
  traverse(roots);
  return list;
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
  const y = Math.min(menu.y, window.innerHeight - 240);
  const isDir  = menu.entry.type === "dir";
  const isTex  = !isDir && menu.entry.name.endsWith(".tex");

  const item = (label: string, action: string, danger = false, accent = false) => (
    <div key={action} className="ctx-menu-item"
      style={danger ? { color: "var(--ink-danger)" } : accent ? { color: "var(--lamp)" } : {}}
      onMouseDown={(e) => { e.preventDefault(); onAction(action); onClose(); }}>
      {label}
    </div>
  );

  if (menu.isMulti) {
    return (
      <div className="ctx-menu" style={{ left: x, top: y }}>
        {item("Move selected items…", "batch-move")}
        {item("Delete selected items", "batch-delete", true)}
        <div className="ctx-menu-sep"/>
        {item("Clear selection (Esc)", "clear-selection")}
      </div>
    );
  }

  return (
    <div className="ctx-menu" style={{ left: x, top: y }}>
      {isDir && (
        <>
          {item("New File", "new-file")}
          {item("New Folder", "new-folder")}
          {item("Upload to Folder…", "upload-to-folder")}
          <div className="ctx-menu-sep"/>
        </>
      )}
      {isTex && <>{item("⊙ Set as root file", "set-root", false, true)}<div className="ctx-menu-sep"/></>}
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
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div style={{ position:"fixed",inset:0,zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",
      background:"rgba(0,0,0,0.5)",backdropFilter:"blur(2px)",padding:16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:"var(--ink-float)",border:"1px solid var(--rule-emphasis)",
        borderRadius:"var(--r-md)",padding:22,width:"100%",maxWidth:440,boxSizing:"border-box",boxShadow:"0 24px 48px rgba(0,0,0,0.55)",overflow:"hidden" }}>
        <div style={{ fontSize: "0.875rem",fontWeight:600,color:"var(--quill-primary)",marginBottom:14,wordBreak:"break-word" }}>{title}</div>
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
          color:"var(--quill-primary)",fontSize: "0.875rem",fontFamily:"var(--font-mono)",outline:"none",boxSizing:"border-box" }}
        onFocus={(e)  => (e.target.style.borderColor = "var(--rule-focus)")}
        onBlur={(e)   => (e.target.style.borderColor = "var(--ctrl-border)")}
      />
      {hint && (
        <div style={{ marginTop:6,fontSize: "0.75rem",color:"var(--quill-muted)",fontFamily:"var(--font-mono)",wordBreak:"break-all",overflowWrap:"anywhere",lineHeight:1.4 }}>
          {hint}
        </div>
      )}
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
  rootFile: string | null;
  expandedDirs: Set<string>;
  dirContents: Map<string, Entry[]>;
  loadingDirs: Set<string>;
  selectedFile: string | null;
  selectedPaths: Set<string>;
  selectMode: boolean;
  inlineRename: { path: string; value: string } | null;
  draggingPath: string | null;
  dragOverDir: string | null;
  hoveredPath: string | null;
  onToggleDir: (path: string) => void;
  onItemClick: (e: React.MouseEvent, entry: Entry) => void;
  onItemToggle: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, entry: Entry) => void;
  onInlineRenameChange: (value: string) => void;
  onInlineRenameSubmit: () => void;
  onInlineRenameCancel: () => void;
  onDragStart: (path: string) => void;
  onDragEnd:   () => void;
  onDragEnterDir: (path: string) => void;
  onDragLeaveDir: () => void;
  onDropToDir: (dirPath: string) => void;
  onHoverChange: (path: string | null) => void;
  onQuickCreate: (parentPath: string, isFolder: boolean) => void;
  onFolderUpload: (dirPath: string) => void;
  onFolderDropUpload: (dirPath: string, files: FileList) => void;
}

function TreeItem(props: TreeItemProps) {
  const {
    entry, depth, project,
    rootFile,
    expandedDirs, dirContents, loadingDirs,
    selectedFile, selectedPaths, selectMode, inlineRename,
    draggingPath, dragOverDir, hoveredPath,
    onToggleDir, onItemClick, onItemToggle, onContextMenu,
    onInlineRenameChange, onInlineRenameSubmit, onInlineRenameCancel,
    onDragStart, onDragEnd, onDragEnterDir, onDragLeaveDir, onDropToDir,
    onHoverChange, onQuickCreate, onFolderUpload, onFolderDropUpload,
  } = props;

  const isDir      = entry.type === "dir";
  const isExpanded = expandedDirs.has(entry.path);
  const isLoading  = loadingDirs.has(entry.path);
  const isSelected = !isDir && selectedFile === entry.path;
  const isMultiSelected = selectedPaths.has(entry.path);
  const isRenaming = inlineRename?.path === entry.path;
  const isDragging = draggingPath === entry.path;
  const isDragOver = isDir && dragOverDir === entry.path;
  const isHovered  = hoveredPath === entry.path;
  const relPath = entry.path.startsWith(`${project}/`) ? entry.path.slice(project.length + 1) : entry.path;
  const isRoot     = !isDir && rootFile === relPath;
  const children   = dirContents.get(entry.path);
  const indent     = depth * 12;

  return (
    <>
      <div
        className={`tree-node${isSelected ? " active" : ""}${isMultiSelected ? " multi-selected" : ""}${isDragOver ? " drag-over" : ""}`}
        style={{
          paddingLeft: indent + 4,
          opacity: isDragging ? 0.4 : 1,
          background: isDragOver
            ? "rgba(200,169,110,0.12)"
            : isMultiSelected
            ? "rgba(200,169,110,0.18)"
            : undefined,
          borderLeft: isMultiSelected ? "2px solid var(--lamp)" : undefined,
          outline: isDragOver ? "1px dashed rgba(200,169,110,0.4)" : undefined,
          position: "relative",
        }}
        onClick={(e) => onItemClick(e, entry)}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, entry); }}
        onMouseEnter={() => onHoverChange(entry.path)}
        onMouseLeave={() => onHoverChange(null)}
        title={entry.path}
        /* All nodes are draggable */
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", entry.path);
          onDragStart(entry.path);
        }}
        onDragEnd={onDragEnd}
        /* Drop target (dirs only) */
        onDragOver={(e) => {
          if (isDir) {
            e.preventDefault();
            const hasFiles = Array.from(e.dataTransfer.types).includes("Files");
            e.dataTransfer.dropEffect = hasFiles ? "copy" : "move";
            onDragEnterDir(entry.path);
          }
        }}
        onDragLeave={() => { if (isDir) onDragLeaveDir(); }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isDir) {
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
              onFolderDropUpload(entry.path, files);
            } else {
              onDropToDir(entry.path);
            }
          }
        }}
      >
        {/* Multi-select checkbox when active */}
        {(selectMode || selectedPaths.size > 1) && (
          <span
            style={{ marginRight: 4, display: "inline-flex", alignItems: "center" }}
            onClick={(e) => { e.stopPropagation(); onItemToggle(entry.path); }}
          >
            <input
              type="checkbox"
              checked={isMultiSelected}
              onChange={() => onItemToggle(entry.path)}
              style={{ accentColor: "var(--lamp)", cursor: "pointer", margin: 0, width: 13, height: 13 }}
            />
          </span>
        )}

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
          <span className="tree-name">
            {entry.name}
            {isRoot && (
              <span title="Compile root file" style={{
                marginLeft: 5, fontSize: "0.6rem", fontWeight: 700,
                color: "var(--lamp)", opacity: 0.9,
                background: "rgba(200,169,110,0.15)",
                border: "1px solid rgba(200,169,110,0.3)",
                borderRadius: 3, padding: "0 3px", verticalAlign: "middle",
              }}>ROOT</span>
            )}
          </span>
        )}

        {/* ── Folder hover quick-actions ── */}
        {isDir && (
          <span
            style={{
              display: "flex", alignItems: "center", gap: 1,
              marginLeft: "auto", paddingRight: 4,
              opacity: isHovered ? 1 : 0,
              pointerEvents: isHovered ? "auto" : "none",
              transition: "opacity 0.12s ease",
              flexShrink: 0,
            }}
          >
            {/* New File inside this folder */}
            <button
              title={`New file in ${entry.name}`}
              className="icon-btn"
              style={{ padding: "1px 3px", minWidth: 20 }}
              onClick={(e) => { e.stopPropagation(); onQuickCreate(entry.path, false); }}
            >
              <IconNewFile />
            </button>
            {/* New Folder inside this folder */}
            <button
              title={`New folder in ${entry.name}`}
              className="icon-btn"
              style={{ padding: "1px 3px", minWidth: 20 }}
              onClick={(e) => { e.stopPropagation(); onQuickCreate(entry.path, true); }}
            >
              <IconNewFolder />
            </button>
            {/* Upload directly to this folder */}
            <button
              title={`Upload files to ${entry.name}`}
              className="icon-btn"
              style={{ padding: "1px 3px", minWidth: 20 }}
              onClick={(e) => { e.stopPropagation(); onFolderUpload(entry.path); }}
            >
              <IconUpload />
            </button>
          </span>
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
  rootFile, onSetRootFile,
  refreshTrigger,
}: {
  project: string;
  selectedFile: string | null;
  onSelect: (path: string) => void;
  rootFile: string | null;
  onSetRootFile: (path: string) => void;
  refreshTrigger?: number;
}) {
  const [rootEntries, setRootEntries] = useState<Entry[] | null>(null);
  const [rootLoading, setRootLoading] = useState(true);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirContents,  setDirContents]  = useState<Map<string, Entry[]>>(new Map());
  const [loadingDirs,  setLoadingDirs]  = useState<Set<string>>(new Set());

  // Multi-selection state
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [lastClickedPath, setLastClickedPath] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const folderUploadTarget = useRef<string>("");

  const [ctxMenu,       setCtxMenu]      = useState<CtxMenu>(null);
  const [dialog,        setDialog]       = useState<Dialog>(null);
  const [inlineRename,  setInlineRename] = useState<{ path: string; value: string } | null>(null);
  const [inputValue,    setInputValue]   = useState("");
  const [working,       setWorking]      = useState(false);
  const [opError,       setOpError]      = useState<string | null>(null);

  // Drag state
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [dragOverDir,  setDragOverDir]  = useState<string | null>(null);
  const [dragOverRoot, setDragOverRoot] = useState(false);
  // Pending drag-drop move — shows confirmation before executing
  const [pendingMove,  setPendingMove]  = useState<{
    fromPath: string; toPath: string; dirPath: string; fileName: string;
  } | null>(null);

  // Hover state for quick-action buttons
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  // Upload state
  const [uploadWorking, setUploadWorking] = useState(false);
  const [uploadResults, setUploadResults] = useState<{ path: string; ok: boolean; error?: string }[] | null>(null);
  const [osDropActive,  setOsDropActive]  = useState(false);  // OS-file drag over panel
  const fileInputRef   = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (refreshTrigger !== undefined) {
      refreshTree();
    }
  }, [refreshTrigger, refreshTree]);

  // ── Context menu ───────────────────────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent, entry: Entry) => {
    const isMulti = selectedPaths.size > 1 && selectedPaths.has(entry.path);
    setCtxMenu({ entry, x: e.clientX, y: e.clientY, isMulti });
  }, [selectedPaths]);

  const handleCtxAction = useCallback((action: string) => {
    const entry = ctxMenu?.entry;
    if (!entry) return;
    setOpError(null);
    if (action === "batch-delete") {
      setDialog({ type: "batch-delete", paths: Array.from(selectedPaths) });
    } else if (action === "batch-move") {
      setInputValue("");
      setDialog({ type: "batch-move", paths: Array.from(selectedPaths) });
    } else if (action === "clear-selection") {
      setSelectedPaths(new Set());
    } else if (action === "upload-to-folder") {
      folderUploadTarget.current = entry.path;
      fileInputRef.current?.click();
    } else if (action === "rename") {
      setInlineRename({ path: entry.path, value: entry.name });
    } else if (action === "new-file") {
      setInputValue(""); setDialog({ type: "create", parentPath: entry.path, isFolder: false });
    } else if (action === "new-folder") {
      setInputValue(""); setDialog({ type: "create", parentPath: entry.path, isFolder: true });
    } else if (action === "delete") {
      setDialog({ type: "delete", entry });
    } else if (action === "move") {
      setInputValue(entry.path); setDialog({ type: "move", entry });
    } else if (action === "set-root") {
      const rel = entry.path.startsWith(`${project}/`)
        ? entry.path.slice(project.length + 1)
        : entry.path;
      onSetRootFile(rel);
    }
  }, [ctxMenu, selectedPaths, project, onSetRootFile]);

  // ── File upload ──────────────────────────────────────────────────────────────
  const handleUpload = useCallback(async (fileList: FileList, targetDir = "") => {
    if (!fileList.length) return;
    setUploadWorking(true);
    const form = new FormData();
    form.append("targetDir", targetDir);
    Array.from(fileList).forEach(f => form.append("files", f));
    try {
      const res  = await fetch(`/api/projects/${encodeURIComponent(project)}/upload`, {
        method: "POST", body: form,
      });
      const data = await res.json();
      setUploadResults(data.results ?? []);
      await refreshTree();
    } catch (e: any) {
      setUploadResults([{ path: "(request failed)", ok: false, error: e.message }]);
    } finally {
      setUploadWorking(false);
    }
  }, [project, refreshTree]);

  // ── Inline rename (optimistic) ─────────────────────────────────────────────
  const submitInlineRename = useCallback(async () => {
    if (!inlineRename?.value.trim()) { setInlineRename(null); return; }
    const oldPath = inlineRename.path;
    const parts = oldPath.split("/");
    parts[parts.length - 1] = inlineRename.value.trim();
    const newPath = parts.join("/");
    if (newPath === oldPath) { setInlineRename(null); return; }

    // ── Optimistic: update tree immediately ──────────────────────────────────
    const rename = (e: Entry) => e.path === oldPath ? { ...e, name: inlineRename.value.trim(), path: newPath } : e;
    const snapshotRoot = rootEntries;
    const snapshotDirs = new Map(dirContents);
    setRootEntries(prev => prev?.map(rename) ?? prev);
    setDirContents(prev => {
      const next = new Map(prev);
      for (const [k, v] of next) next.set(k, v.map(rename));
      return next;
    });
    setInlineRename(null);

    // ── Background sync ──────────────────────────────────────────────────────
    try {
      const res  = await fetch(`/api/projects/${encodeURIComponent(project)}/rename`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: oldPath, to: newPath }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Rename failed");
    } catch (e: any) {
      // Revert
      setRootEntries(snapshotRoot);
      setDirContents(snapshotDirs);
      setOpError(e.message);
    }
  }, [inlineRename, project, rootEntries, dirContents]);

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

  // ── Create (optimistic) ────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!inputValue.trim() || dialog?.type !== "create") return;
    const parent = (dialog as any).parentPath as string;
    const isFolder = (dialog as any).isFolder as boolean;
    const newPath = parent ? `${parent}/${inputValue.trim()}` : inputValue.trim();
    const newName = inputValue.trim();
    setOpError(null);

    // ── Optimistic: add entry immediately ────────────────────────────────────
    const newEntry: Entry = { name: newName, path: newPath, type: isFolder ? "dir" : "file" };
    const snapshotRoot = rootEntries;
    const snapshotDirs = new Map(dirContents);
    if (parent) {
      setDirContents(prev => {
        const next = new Map(prev);
        const existing = next.get(parent) || [];
        next.set(parent, [...existing, newEntry]);
        return next;
      });
    } else {
      setRootEntries(prev => [...(prev || []), newEntry]);
    }
    setDialog(null);

    // ── Background sync ──────────────────────────────────────────────────────
    try {
      const res  = await fetch(`/api/projects/${encodeURIComponent(project)}/file`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: newPath, isFolder }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
    } catch (e: any) {
      // Revert
      setRootEntries(snapshotRoot);
      setDirContents(snapshotDirs);
      setOpError(e.message);
    }
  }, [inputValue, dialog, project, rootEntries, dirContents]);

  // ── Delete (optimistic) ────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (dialog?.type !== "delete") return;
    const entry = dialog.entry;
    setOpError(null);

    // ── Optimistic: remove immediately ───────────────────────────────────────
    const dp = entry.path;
    const snapshotRoot = rootEntries;
    const snapshotDirs = new Map(dirContents);
    const snapshotExp  = new Set(expandedDirs);
    setRootEntries(prev => prev?.filter(e => e.path !== dp && !e.path.startsWith(dp + "/")) ?? prev);
    setDirContents(prev => {
      const next = new Map(prev);
      for (const [k, v] of next) {
        if (k === dp || k.startsWith(dp + "/")) next.delete(k);
        else next.set(k, v.filter(e => e.path !== dp && !e.path.startsWith(dp + "/")));
      }
      return next;
    });
    setExpandedDirs(prev => { const n = new Set(prev); for (const x of prev) if (x===dp||x.startsWith(dp+"/")) n.delete(x); return n; });
    setDialog(null);

    // ── Background sync ──────────────────────────────────────────────────────
    try {
      const tp  = entry.type === "dir" ? "&type=dir" : "&type=file";
      const res  = await fetch(
        `/api/projects/${encodeURIComponent(project)}/file?path=${encodeURIComponent(entry.path)}${tp}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
    } catch (e: any) {
      // Revert
      setRootEntries(snapshotRoot);
      setDirContents(snapshotDirs);
      setExpandedDirs(snapshotExp);
      setOpError(e.message);
    }
  }, [dialog, project, rootEntries, dirContents, expandedDirs]);

  // ── Move dialog (optimistic) ───────────────────────────────────────────────
  const handleMove = useCallback(async () => {
    if (dialog?.type !== "move" || !inputValue.trim()) return;
    const oldPath = dialog.entry.path;
    const newPath = inputValue.trim();
    const newName = newPath.split("/").pop() || newPath;

    // Optimistic
    const rename = (e: Entry) => e.path === oldPath ? { ...e, name: newName, path: newPath } : e;
    const snapshotRoot = rootEntries;
    const snapshotDirs = new Map(dirContents);
    setRootEntries(prev => prev?.map(rename) ?? prev);
    setDirContents(prev => { const next = new Map(prev); for (const [k, v] of next) next.set(k, v.map(rename)); return next; });
    setDialog(null);

    try {
      const res  = await fetch(`/api/projects/${encodeURIComponent(project)}/rename`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: oldPath, to: newPath }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed");
    } catch (e: any) {
      setRootEntries(snapshotRoot); setDirContents(snapshotDirs);
      setOpError(e.message);
    }
  }, [dialog, inputValue, project, rootEntries, dirContents]);

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  const handleDragStart   = useCallback((path: string) => setDraggingPath(path), []);
  const handleDragEnd     = useCallback(() => { setDraggingPath(null); setDragOverDir(null); setDragOverRoot(false); }, []);
  const handleDragEnterDir = useCallback((path: string) => { setDragOverDir(path); setDragOverRoot(false); }, []);
  const handleDragLeaveDir = useCallback(() => setDragOverDir(null), []);

  // Capture the drag-drop intent — shows confirmation before any state mutation
  const handleDropToDir = useCallback((dirPath: string) => {
    const fromPath = draggingPath;
    setDraggingPath(null); setDragOverDir(null); setDragOverRoot(false);
    if (!fromPath) return;
    const fileName = fromPath.split("/").pop()!;
    const toPath   = dirPath ? `${dirPath}/${fileName}` : fileName;
    if (toPath === fromPath) return;
    setPendingMove({ fromPath, toPath, dirPath, fileName });
  }, [draggingPath]);

  // Execute the confirmed move (optimistic update + GitHub sync)
  const confirmMove = useCallback(async () => {
    if (!pendingMove) return;
    const { fromPath, toPath, dirPath, fileName } = pendingMove;
    setPendingMove(null);
    setOpError(null);

    // Find the entry synchronously before any setState
    let movedEntry: Entry | undefined = rootEntries?.find(e => e.path === fromPath);
    if (!movedEntry) {
      for (const v of dirContents.values()) {
        const found = v.find(e => e.path === fromPath);
        if (found) { movedEntry = found; break; }
      }
    }
    const snapshotRoot = rootEntries;
    const snapshotDirs = new Map(dirContents);
    const updatedEntry: Entry = movedEntry
      ? { ...movedEntry, name: fileName, path: toPath }
      : { name: fileName, path: toPath, type: "file" };

    setRootEntries(prev => {
      const without = prev?.filter(e => e.path !== fromPath) ?? [];
      return dirPath ? without : [...without, updatedEntry];
    });
    setDirContents(prev => {
      const next = new Map(prev);
      for (const [k, v] of next) next.set(k, v.filter(e => e.path !== fromPath));
      if (dirPath && next.has(dirPath)) next.set(dirPath, [...(next.get(dirPath) || []), updatedEntry]);
      return next;
    });

    try {
      const res  = await fetch(`/api/projects/${encodeURIComponent(project)}/rename`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromPath, to: toPath }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Move failed");
    } catch (e: any) {
      setRootEntries(snapshotRoot);
      setDirContents(snapshotDirs);
      setOpError(e.message);
    }
  }, [pendingMove, project, rootEntries, dirContents]);


  // ── Select guard & Multi-select click handler ─────────────────────────────
  const handleSelectFile = useCallback((path: string) => {
    const all = [...(rootEntries||[]), ...Array.from(dirContents.values()).flat()];
    if (all.find((e) => e.path === path)?.type === "dir") return;
    onSelect(path);
  }, [rootEntries, dirContents, onSelect]);

  const handleItemClick = useCallback((e: React.MouseEvent, entry: Entry) => {
    const isDir = entry.type === "dir";

    // Shift+Click: range selection
    if (e.shiftKey && lastClickedPath) {
      e.preventDefault();
      const visible = getVisibleEntries(rootEntries, expandedDirs, dirContents);
      const lastIdx = visible.findIndex(v => v.path === lastClickedPath);
      const currIdx = visible.findIndex(v => v.path === entry.path);
      if (lastIdx !== -1 && currIdx !== -1) {
        const start = Math.min(lastIdx, currIdx);
        const end = Math.max(lastIdx, currIdx);
        const range = new Set(selectedPaths);
        for (let i = start; i <= end; i++) {
          range.add(visible[i].path);
        }
        setSelectedPaths(range);
        return;
      }
    }

    // Ctrl/Cmd+Click or Select Mode toggle
    if (e.ctrlKey || e.metaKey || selectMode) {
      e.preventDefault();
      setSelectedPaths(prev => {
        const next = new Set(prev);
        if (next.has(entry.path)) next.delete(entry.path);
        else next.add(entry.path);
        return next;
      });
      setLastClickedPath(entry.path);
      return;
    }

    // Normal click
    setSelectedPaths(new Set([entry.path]));
    setLastClickedPath(entry.path);

    if (isDir) {
      handleToggleDir(entry.path);
    } else {
      handleSelectFile(entry.path);
    }
  }, [lastClickedPath, rootEntries, expandedDirs, dirContents, selectedPaths, selectMode, handleToggleDir, handleSelectFile]);

  const handleItemToggle = useCallback((path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    setLastClickedPath(path);
  }, []);

  // Keyboard shortcut to clear selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedPaths.size > 0) {
        setSelectedPaths(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedPaths]);

  // ── Folder upload triggers ────────────────────────────────────────────────
  const handleFolderUpload = useCallback((dirPath: string) => {
    folderUploadTarget.current = dirPath;
    fileInputRef.current?.click();
  }, []);

  const handleFolderDropUpload = useCallback((dirPath: string, files: FileList) => {
    handleUpload(files, dirPath);
  }, [handleUpload]);

  // ── Quick create from folder hover button ─────────────────────────────────
  const handleQuickCreate = useCallback((parentPath: string, isFolder: boolean) => {
    setInputValue("");
    setOpError(null);
    setDialog({ type: "create", parentPath, isFolder });
  }, []);

  // ── Batch Delete ──────────────────────────────────────────────────────────
  const handleBatchDelete = useCallback(async () => {
    if (!selectedPaths.size) return;
    setWorking(true);
    setOpError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project)}/file`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: Array.from(selectedPaths) }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Batch delete failed");
      setSelectedPaths(new Set());
      setDialog(null);
      await refreshTree();
    } catch (e: any) {
      setOpError(e.message);
    } finally {
      setWorking(false);
    }
  }, [selectedPaths, project, refreshTree]);

  // ── Batch Move ────────────────────────────────────────────────────────────
  const handleBatchMove = useCallback(async () => {
    if (!selectedPaths.size) return;
    setWorking(true);
    setOpError(null);
    try {
      const targetDir = inputValue.trim().replace(/^\/|\/$/g, "");
      const moves = Array.from(selectedPaths).map((fromPath) => {
        const fileName = fromPath.split("/").pop() || fromPath;
        const toPath = targetDir ? `${targetDir}/${fileName}` : fileName;
        return { from: fromPath, to: toPath };
      });

      const res = await fetch(`/api/projects/${encodeURIComponent(project)}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moves }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Batch move failed");
      setSelectedPaths(new Set());
      setDialog(null);
      await refreshTree();
    } catch (e: any) {
      setOpError(e.message);
    } finally {
      setWorking(false);
    }
  }, [selectedPaths, inputValue, project, refreshTree]);

  // ── Shared TreeItem props ──────────────────────────────────────────────────
  const sharedProps = {
    project, rootFile, expandedDirs, dirContents, loadingDirs, selectedFile,
    selectedPaths, selectMode, inlineRename,
    draggingPath, dragOverDir, hoveredPath,
    onToggleDir: handleToggleDir,
    onItemClick: handleItemClick,
    onItemToggle: handleItemToggle,
    onContextMenu: handleContextMenu,
    onInlineRenameChange: (v: string) => setInlineRename((r) => r ? { ...r, value: v } : null),
    onInlineRenameSubmit: submitInlineRename,
    onInlineRenameCancel: () => setInlineRename(null),
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onDragEnterDir: handleDragEnterDir,
    onDragLeaveDir: handleDragLeaveDir,
    onDropToDir: handleDropToDir,
    onHoverChange: setHoveredPath,
    onQuickCreate: handleQuickCreate,
    onFolderUpload: handleFolderUpload,
    onFolderDropUpload: handleFolderDropUpload,
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

        <button
          className={`icon-btn${selectMode ? " active" : ""}`}
          title={selectMode ? "Exit multi-select mode" : "Select multiple files"}
          style={{
            background: selectMode ? "rgba(200,169,110,0.2)" : undefined,
            color: selectMode ? "var(--lamp)" : undefined,
          }}
          onClick={() => setSelectMode(m => !m)}
        >
          <IconChecklist/>
        </button>
        <button className="icon-btn" title="New File"
          onClick={() => { setInputValue(""); setDialog({ type: "create", parentPath: "", isFolder: false }); }}>
          <IconNewFile/>
        </button>
        <button className="icon-btn" title="New Folder"
          onClick={() => { setInputValue(""); setDialog({ type: "create", parentPath: "", isFolder: true }); }}>
          <IconNewFolder/>
        </button>
        {/* Separator */}
        <span style={{ width: 1, height: 12, background: "var(--rule-faint)", margin: "0 2px", display: "inline-block" }}/>
        <button className="icon-btn" title="Upload files" disabled={uploadWorking}
          onClick={() => { folderUploadTarget.current = ""; fileInputRef.current?.click(); }}>
          <IconUpload/>
        </button>
        <button className="icon-btn" title="Upload folder" disabled={uploadWorking}
          onClick={() => { folderUploadTarget.current = ""; folderInputRef.current?.click(); }}>
          <IconUploadFolder/>
        </button>
        {/* Separator */}
        <span style={{ width: 1, height: 12, background: "var(--rule-faint)", margin: "0 2px", display: "inline-block" }}/>
        <button className="icon-btn" title="Refresh" onClick={refreshTree}>
          <IconRefresh/>
        </button>
      </div>

      {/* ── Multi-select batch action bar ── */}
      {selectedPaths.size > 1 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "5px 10px", background: "rgba(200,169,110,0.12)",
          borderBottom: "1px solid rgba(200,169,110,0.3)",
          fontSize: "0.75rem", fontFamily: "var(--font-mono)", flexShrink: 0,
        }}>
          <span style={{ color: "var(--lamp)", fontWeight: 600 }}>
            {selectedPaths.size} items selected
          </span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              className="btn-sm"
              style={{ padding: "2px 8px", fontSize: "0.6875rem", background: "var(--lamp-dim)", color: "var(--lamp)", border: "1px solid rgba(200,169,110,0.3)" }}
              onClick={() => {
                setInputValue("");
                setDialog({ type: "batch-move", paths: Array.from(selectedPaths) });
              }}
            >
              Move
            </button>
            <button
              className="btn-sm"
              style={{ padding: "2px 8px", fontSize: "0.6875rem", background: "var(--ink-danger-dim)", color: "var(--ink-danger)", border: "1px solid rgba(176,82,82,0.3)" }}
              onClick={() => {
                setDialog({ type: "batch-delete", paths: Array.from(selectedPaths) });
              }}
            >
              Delete
            </button>
            <button
              className="btn-sm btn-ghost"
              style={{ padding: "2px 6px", fontSize: "0.6875rem" }}
              onClick={() => setSelectedPaths(new Set())}
              title="Clear selection (Esc)"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" multiple style={{ display: "none" }}
        onChange={e => {
          if (e.target.files) handleUpload(e.target.files, folderUploadTarget.current);
          folderUploadTarget.current = "";
          e.target.value = "";
        }}
      />
      <input ref={folderInputRef} type="file" style={{ display: "none" }}
        // @ts-ignore — webkitdirectory is not in standard TS types
        webkitdirectory="true" multiple
        onChange={e => {
          if (e.target.files) handleUpload(e.target.files, folderUploadTarget.current);
          folderUploadTarget.current = "";
          e.target.value = "";
        }}
      />

      {/* ── Tree — also acts as root drop zone and OS-file drop zone ── */}
      <div
        style={{
          flex: 1, overflowY: "auto", overflowX: "hidden", fontSize: "0.875rem", position: "relative",
          outline: (dragOverRoot || osDropActive) ? "2px dashed rgba(200,169,110,0.5)" : "2px dashed transparent",
          outlineOffset: -2,
          transition: "outline-color 0.1s ease",
        }}
        onDragOver={(e) => {
          // OS file drag (no draggingPath set) vs internal file move
          const hasFiles = Array.from(e.dataTransfer.types).includes("Files");
          if (hasFiles && !draggingPath) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setOsDropActive(true);
            return;
          }
          if (!draggingPath) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          // Only show root highlight if not hovering a child dir node
          if (!dragOverDir) setDragOverRoot(true);
        }}
        onDragLeave={(e) => {
          // Only clear if leaving the container itself (not entering a child)
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOverRoot(false);
            setOsDropActive(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOverRoot(false);
          setOsDropActive(false);
          // OS-file drop
          if (e.dataTransfer.files?.length && !draggingPath) {
            handleUpload(e.dataTransfer.files);
            return;
          }
          // Internal move drop
          if (!dragOverDir) handleDropToDir("");
        }}
      >
        {/* OS drag-drop overlay hint */}
        {osDropActive && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 10,
            background: "rgba(200,169,110,0.07)",
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--lamp)", fontWeight: 600 }}>
              Drop to upload
            </span>
          </div>
        )}
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
        {/* Root drop label — shows while dragging */}
        {draggingPath && !dragOverDir && (
          <div style={{
            margin: "4px 8px",
            padding: "5px 10px",
            borderRadius: "var(--r-sm)",
            fontSize: "0.75rem",
            color: "var(--lamp)",
            opacity: dragOverRoot ? 1 : 0.4,
            transition: "opacity 0.15s",
            pointerEvents: "none",
            fontFamily: "var(--font-mono)",
          }}>
            ↙ Drop here to move to root
          </div>
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

      {/* ── Batch Delete dialog ── */}
      {dialog?.type === "batch-delete" && (
        <Modal title={`Delete ${dialog.paths.length} items`} onClose={() => setDialog(null)}>
          <p style={{ fontSize: "0.875rem", color: "var(--quill-secondary)", lineHeight: 1.6 }}>
            Permanently delete the following {dialog.paths.length} items? This cannot be undone.
          </p>
          <div style={{
            maxHeight: 140, overflowY: "auto", margin: "10px 0", padding: "8px 10px",
            background: "rgba(0,0,0,0.25)", borderRadius: "var(--r-sm)",
            fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--quill-secondary)",
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            {dialog.paths.map((p) => (
              <div key={p} style={{ wordBreak: "break-all" }}>• {p}</div>
            ))}
          </div>
          {opError && <div style={{ marginTop: 8, fontSize: "0.8125rem", color: "var(--ink-danger)" }}>{opError}</div>}
          <ModalActions onCancel={() => setDialog(null)} onConfirm={handleBatchDelete}
            confirmLabel={working ? "Deleting…" : `Delete ${dialog.paths.length} items`} danger disabled={working}/>
        </Modal>
      )}

      {/* ── Batch Move dialog ── */}
      {dialog?.type === "batch-move" && (
        <Modal title={`Move ${dialog.paths.length} items`} onClose={() => setDialog(null)}>
          <div style={{ fontSize: "0.8125rem", color: "var(--quill-tertiary)", marginBottom: 8 }}>
            Destination folder (leave blank for project root):
          </div>
          <ModalInput
            value={inputValue}
            onChange={setInputValue}
            placeholder="chapters or figures/subfolder"
            onSubmit={handleBatchMove}
          />
          <div style={{
            maxHeight: 120, overflowY: "auto", margin: "10px 0 0", padding: "8px 10px",
            background: "rgba(0,0,0,0.25)", borderRadius: "var(--r-sm)",
            fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--quill-secondary)",
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            {dialog.paths.map((p) => (
              <div key={p} style={{ wordBreak: "break-all" }}>• {p}</div>
            ))}
          </div>
          {opError && <div style={{ marginTop: 8, fontSize: "0.8125rem", color: "var(--ink-danger)" }}>{opError}</div>}
          <ModalActions onCancel={() => setDialog(null)} onConfirm={handleBatchMove}
            confirmLabel={working ? "Moving…" : `Move ${dialog.paths.length} items`} disabled={working}/>
        </Modal>
      )}

      {/* ── Drag-drop confirmation modal ── */}
      {pendingMove && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 2000,
          background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setPendingMove(null)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--ink-raised)", border: "1px solid var(--rule-soft)",
              borderRadius: "var(--r-md)", padding: "24px 28px", maxWidth: 360, width: "90%",
              boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            }}
          >
            <h4 style={{ margin: "0 0 12px", fontSize: "0.9375rem", color: "var(--quill-primary)", fontWeight: 600 }}>
              Move file?
            </h4>
            <p style={{ margin: "0 0 6px", fontSize: "0.8125rem", color: "var(--quill-secondary)", lineHeight: 1.6, wordBreak: "break-all" }}>
              Move{" "}
              <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--lamp)", background: "rgba(200,169,110,0.12)", padding: "1px 5px", borderRadius: 3, wordBreak: "break-all" }}>
                {pendingMove.fileName}
              </code>
            </p>
            <p style={{ margin: "0 0 20px", fontSize: "0.8125rem", color: "var(--quill-secondary)", lineHeight: 1.6, wordBreak: "break-all" }}>
              to{" "}
              <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--lamp)", background: "rgba(200,169,110,0.12)", padding: "1px 5px", borderRadius: 3, wordBreak: "break-all" }}>
                {pendingMove.dirPath ? `${pendingMove.dirPath}/` : "/ (project root)"}
              </code>
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                className="btn-sm btn-ghost"
                onClick={() => setPendingMove(null)}
              >
                Cancel
              </button>
              <button
                className="btn-sm btn-primary"
                onClick={confirmMove}
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Upload working spinner ── */}
      {uploadWorking && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 3000,
          background: "rgba(0,0,0,0.35)", backdropFilter: "blur(3px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "var(--ink-raised)", border: "1px solid var(--rule-soft)",
            borderRadius: "var(--r-md)", padding: "28px 36px",
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
          }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="var(--lamp)" strokeWidth={2.5} strokeLinecap="round"
              style={{ animation: "spin 0.8s linear infinite" }}>
              <path d="M16 4 A12 12 0 1 1 4 16"/>
            </svg>
            <span style={{ fontSize: "0.875rem", color: "var(--quill-secondary)", fontWeight: 500 }}>Uploading to GitHub…</span>
          </div>
        </div>
      )}

      {/* ── Upload results modal ── */}
      {uploadResults && !uploadWorking && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 3000,
          background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setUploadResults(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "var(--ink-raised)", border: "1px solid var(--rule-soft)",
            borderRadius: "var(--r-md)", padding: "24px 28px", maxWidth: 420, width: "90%",
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)", maxHeight: "70vh", display: "flex", flexDirection: "column",
          }}>
            <h4 style={{ margin: "0 0 14px", fontSize: "0.9375rem", color: "var(--quill-primary)", fontWeight: 600 }}>
              Upload results
            </h4>
            <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              {uploadResults.map((r, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 8px", borderRadius: "var(--r-sm)",
                  background: r.ok ? "rgba(52,168,83,0.07)" : "rgba(176,82,82,0.1)",
                  fontSize: "0.8125rem",
                }}>
                  <span style={{ color: r.ok ? "var(--ink-success)" : "var(--ink-danger)", fontWeight: 700, fontSize: "1em" }}>
                    {r.ok ? "✓" : "✗"}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--quill-secondary)", flex: 1, wordBreak: "break-all" }}>
                    {r.path}
                  </span>
                  {r.error && (
                    <span style={{ color: "var(--ink-danger)", fontSize: "0.75rem" }}>{r.error}</span>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn-sm" onClick={() => setUploadResults(null)}
                style={{ background: "var(--lamp-dim)", borderColor: "rgba(200,169,110,0.3)", color: "var(--lamp)" }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
