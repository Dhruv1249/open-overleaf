"use client";

import { useEffect, useState } from "react";

type Entry = { name: string; path: string; type: "file" | "dir" };

// File type -> short display label
function fileIcon(name: string): string {
  if (name.endsWith(".tex")) return "§";
  if (name.endsWith(".bib")) return "⊕";
  if (name.endsWith(".pdf")) return "□";
  if (name.endsWith(".svg") || name.endsWith(".png") || name.endsWith(".jpg")) return "◈";
  if (name.endsWith(".cls") || name.endsWith(".sty")) return "∑";
  return "·";
}

function fileTypeLabel(name: string): string {
  const ext = name.split(".").pop() || "";
  return ext.toUpperCase();
}

function isFolder(entry: Entry) {
  return entry.type === "dir";
}

export default function ProjectTree({
  project,
  onSelect,
  selectedFile,
}: {
  project: string;
  onSelect: (path: string) => void;
  selectedFile?: string | null;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(project)}/tree`
        );
        const data = await res.json();
        if (!mounted) return;
        setEntries(data.entries || []);
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [project]);

  if (loading) {
    return (
      <div className="composition-rail">
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ padding: "6px 16px" }}>
            <div
              className="skeleton"
              style={{ height: 10, width: `${60 + i * 8}%`, borderRadius: 3 }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--quill-muted)" }}>
        No files found
      </div>
    );
  }

  // Separate folders and files
  const folders = entries.filter(isFolder);
  const files = entries.filter((e) => !isFolder(e));

  const handleSelect = (entry: Entry) => {
    if (entry.type === "dir") {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.has(entry.path) ? next.delete(entry.path) : next.add(entry.path);
        return next;
      });
    } else {
      const relativePath = entry.path.replace(`${project}/`, "");
      onSelect(relativePath);
    }
  };

  return (
    <div className="composition-rail">
      {/* Folders first */}
      {folders.map((entry) => (
        <div key={entry.path}>
          <div
            className="rail-item"
            onClick={() => handleSelect(entry)}
            title={entry.path}
          >
            <span className="rail-item-icon" style={{ opacity: 0.5 }}>
              {expanded.has(entry.path) ? "▾" : "▸"}
            </span>
            <span className="rail-item-name" style={{ fontWeight: 500 }}>
              {entry.name}
            </span>
          </div>
        </div>
      ))}

      {/* Divider if both */}
      {folders.length > 0 && files.length > 0 && (
        <div className="rail-rule" />
      )}

      {/* Files */}
      {files.map((entry) => {
        const relativePath = entry.path.replace(`${project}/`, "");
        const isActive = selectedFile === relativePath;
        return (
          <div
            key={entry.path}
            className={`rail-item ${isActive ? "active" : ""}`}
            onClick={() => handleSelect(entry)}
            title={entry.path}
          >
            <span className="rail-item-icon mono">{fileIcon(entry.name)}</span>
            <span className="rail-item-name">{entry.name}</span>
            <span className="rail-item-type">{fileTypeLabel(entry.name)}</span>
          </div>
        );
      })}
    </div>
  );
}
