"use client";

import React, { useState, useEffect, useRef } from "react";
import MobilePdfViewer from "./MobilePdfViewer";

interface BinaryFileViewerProps {
  project: string;
  filePath: string;
}

export function isImageFile(path: string): boolean {
  return /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(path);
}

export function isPdfFile(path: string): boolean {
  return /\.pdf$/i.test(path);
}

export default function BinaryFileViewer({ project, filePath }: BinaryFileViewerProps) {
  const isImage = isImageFile(filePath);
  const isPdf = isPdfFile(filePath);
  const fileName = filePath.split("/").pop() || filePath;

  const rawUrl = `/api/projects/${encodeURIComponent(project)}/file?path=${encodeURIComponent(filePath)}&raw=true`;

  const [zoom, setZoom] = useState<number>(100);
  const [naturalDimensions, setNaturalDimensions] = useState<{ width: number; height: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset zoom on file switch
  useEffect(() => {
    setZoom(100);
    setNaturalDimensions(null);
    setLoadError(null);
  }, [project, filePath]);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 25, 400));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 25, 25));
  const handleZoomReset = () => setZoom(100);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalDimensions({ width: img.naturalWidth, height: img.naturalHeight });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "var(--parchment-deep, #0f1117)",
        color: "var(--quill-primary, #e2e8f0)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* ── Top Bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 14px",
          borderBottom: "1px solid var(--rule-subtle, rgba(255, 255, 255, 0.08))",
          background: "var(--ink-surface, #161822)",
          fontSize: "0.8125rem",
          minHeight: 40,
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {isImage ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: "var(--accent-primary, #60a5fa)" }}>
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: "var(--accent-danger, #f87171)" }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          )}
          <span
            style={{
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={filePath}
          >
            {fileName}
          </span>
          {naturalDimensions && (
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--quill-muted, #94a3b8)",
                background: "var(--ink-overlay, rgba(255, 255, 255, 0.05))",
                padding: "2px 6px",
                borderRadius: 4,
                whiteSpace: "nowrap",
              }}
            >
              {naturalDimensions.width} × {naturalDimensions.height} px
            </span>
          )}
        </div>

        {/* ── Toolbar Actions ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {isImage && (
            <>
              <button
                type="button"
                className="icon-btn"
                onClick={handleZoomOut}
                disabled={zoom <= 25}
                title="Zoom Out (-25%)"
                style={{ width: 28, height: 28, padding: 0 }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              <button
                type="button"
                className="btn-sm"
                onClick={handleZoomReset}
                title="Reset zoom to 100%"
                style={{ minWidth: 46, padding: "2px 6px", fontSize: "0.75rem", textAlign: "center" }}
              >
                {zoom}%
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={handleZoomIn}
                disabled={zoom >= 400}
                title="Zoom In (+25%)"
                style={{ width: 28, height: 28, padding: 0 }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </>
          )}

          <a
            href={rawUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="icon-btn"
            title="Open in new tab"
            style={{ width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>

          <a
            href={rawUrl}
            download={fileName}
            className="btn-sm"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              fontSize: "0.75rem",
              textDecoration: "none",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download
          </a>
        </div>
      </div>

      {/* ── Content Viewport ── */}
      <div
        style={{
          flex: 1,
          width: "100%",
          height: "calc(100% - 40px)",
          overflow: "auto",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isImage
            ? "repeating-conic-gradient(rgba(128, 128, 128, 0.08) 0% 25%, transparent 0% 50%) 50% / 20px 20px var(--parchment-deep, #0b0d13)"
            : "var(--parchment-deep, #0b0d13)",
        }}
      >
        {loadError && (
          <div style={{ textAlign: "center", color: "var(--accent-danger, #f87171)", padding: 20 }}>
            <p style={{ fontWeight: 500 }}>Failed to load asset</p>
            <p style={{ fontSize: "0.8125rem", color: "var(--quill-muted, #94a3b8)", marginTop: 4 }}>{loadError}</p>
          </div>
        )}

        {isImage && (
          <div
            style={{
              padding: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: "100%",
              minHeight: "100%",
              boxSizing: "border-box",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={rawUrl}
              alt={fileName}
              onLoad={handleImageLoad}
              onError={() => setLoadError("Unable to render image from disk.")}
              style={{
                maxWidth: zoom === 100 ? "90%" : "none",
                maxHeight: zoom === 100 ? "85vh" : "none",
                width: zoom !== 100 && naturalDimensions ? `${(naturalDimensions.width * zoom) / 100}px` : undefined,
                height: zoom !== 100 && naturalDimensions ? `${(naturalDimensions.height * zoom) / 100}px` : undefined,
                objectFit: "contain",
                boxShadow: "0 8px 30px rgba(0, 0, 0, 0.45)",
                borderRadius: 4,
                transition: "width 0.15s ease, height 0.15s ease",
              }}
            />
          </div>
        )}

        {isPdf && (
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
            <MobilePdfViewer pdfUrl={rawUrl} pdfKey={1} />
          </div>
        )}
      </div>
    </div>
  );
}
