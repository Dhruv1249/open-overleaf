"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

interface MobilePdfViewerProps {
  pdfUrl: string;
  pdfKey: number;
}

// Load PDF.js from local public directory with fallback to cdnjs
function loadPdfJs(): Promise<any> {
  const win = window as any;
  if (win.pdfjsLib) {
    return Promise.resolve(win.pdfjsLib);
  }

  return new Promise((resolve, reject) => {
    const tryCdn = () => {
      const cdnScript = document.createElement("script");
      cdnScript.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      cdnScript.async = true;
      cdnScript.onload = () => {
        const lib = (window as any).pdfjsLib;
        if (lib) {
          lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          resolve(lib);
        } else {
          reject(new Error("Failed to initialize PDF.js from CDN"));
        }
      };
      cdnScript.onerror = () => reject(new Error("Failed to load PDF.js"));
      document.head.appendChild(cdnScript);
    };

    const localScript = document.createElement("script");
    localScript.src = "/pdfjs/pdf.min.js";
    localScript.async = true;
    localScript.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.js";
        resolve(lib);
      } else {
        tryCdn();
      }
    };
    localScript.onerror = () => tryCdn();
    document.head.appendChild(localScript);
  });
}

interface PageCanvasProps {
  pageNum: number;
  numPages: number;
  onMount: (pageNum: number, canvas: HTMLCanvasElement | null) => void;
}

function PageCanvas({ pageNum, numPages, onMount }: PageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    onMount(pageNum, canvasRef.current);
    return () => {
      onMount(pageNum, null);
    };
  }, [pageNum, onMount]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
      }}
    >
      {numPages > 1 && (
        <div
          style={{
            fontSize: "0.6875rem",
            fontFamily: "var(--font-mono, monospace)",
            color: "var(--quill-tertiary, #6e7681)",
            marginBottom: 4,
          }}
        >
          Page {pageNum} of {numPages}
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          background: "#ffffff",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.35)",
          borderRadius: 2,
        }}
      />
    </div>
  );
}

export default function MobilePdfViewer({ pdfUrl, pdfKey }: MobilePdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [scaleMultiplier, setScaleMultiplier] = useState<number>(1.0);
  const pdfDocRef = useRef<any>(null);
  const renderTasksRef = useRef<{ [pageIndex: number]: any }>({});
  const canvasRefs = useRef<{ [pageIndex: number]: HTMLCanvasElement | null }>({});

  // Fetch and parse the PDF document when pdfUrl or pdfKey changes
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);

    // Cancel any active render tasks
    Object.values(renderTasksRef.current).forEach((task) => {
      try {
        task?.cancel();
      } catch {}
    });
    renderTasksRef.current = {};

    loadPdfJs()
      .then((pdfjs) => {
        if (isCancelled) return null;
        const loadingTask = pdfjs.getDocument({
          url: pdfUrl,
          withCredentials: true,
          cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
          cMapPacked: true,
        });
        return loadingTask.promise;
      })
      .then((doc) => {
        if (isCancelled || !doc) return;
        if (pdfDocRef.current) {
          try {
            pdfDocRef.current.destroy();
          } catch {}
        }
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setLoading(false);
      })
      .catch((err: any) => {
        if (isCancelled) return;
        console.error("PDF.js load error:", err);
        setError(err.message || "Failed to render PDF preview");
        setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [pdfUrl, pdfKey]);

  // Render a specific page onto its canvas
  const renderPage = useCallback(
    async (pageNumber: number, canvas: HTMLCanvasElement) => {
      const doc = pdfDocRef.current;
      if (!doc || !canvas || !containerRef.current) return;

      // Cancel previous render task for this page if ongoing
      if (renderTasksRef.current[pageNumber]) {
        try {
          renderTasksRef.current[pageNumber].cancel();
        } catch {}
        delete renderTasksRef.current[pageNumber];
      }

      try {
        const page = await doc.getPage(pageNumber);
        const containerWidth = containerRef.current.clientWidth || window.innerWidth;
        const unscaledViewport = page.getViewport({ scale: 1.0 });

        // Calculate scale to fit container width with 16px margins
        const availableWidth = Math.max(containerWidth - 32, 240);
        const fitScale = availableWidth / unscaledViewport.width;
        const targetScale = fitScale * scaleMultiplier;

        const viewport = page.getViewport({ scale: targetScale });
        const dpr = Math.min(window.devicePixelRatio || 1, 3);

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const renderContext = {
          canvasContext: ctx,
          viewport,
        };

        const renderTask = page.render(renderContext);
        renderTasksRef.current[pageNumber] = renderTask;
        await renderTask.promise;
        delete renderTasksRef.current[pageNumber];
      } catch (err: any) {
        if (err?.name !== "RenderingCancelledException") {
          console.warn(`Render error on page ${pageNumber}:`, err);
        }
      }
    },
    [scaleMultiplier]
  );

  // Re-render all pages when numPages, scaleMultiplier, or loading changes
  useEffect(() => {
    if (loading || !numPages || !pdfDocRef.current) return;

    for (let p = 1; p <= numPages; p++) {
      const canvas = canvasRefs.current[p];
      if (canvas) {
        renderPage(p, canvas);
      }
    }
  }, [loading, numPages, scaleMultiplier, renderPage]);

  // Handle window resize with debouncing
  useEffect(() => {
    let timeout: any;
    const onResize = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (loading || !numPages || !pdfDocRef.current) return;
        for (let p = 1; p <= numPages; p++) {
          const canvas = canvasRefs.current[p];
          if (canvas) renderPage(p, canvas);
        }
      }, 150);
    };

    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("resize", onResize);
    };
  }, [loading, numPages, renderPage]);

  const handleZoomIn = () => setScaleMultiplier((m) => Math.min(Number((m + 0.25).toFixed(2)), 3.0));
  const handleZoomOut = () => setScaleMultiplier((m) => Math.max(Number((m - 0.25).toFixed(2)), 0.5));
  const handleZoomReset = () => setScaleMultiplier(1.0);

  const handlePageMount = useCallback(
    (pageNum: number, canvas: HTMLCanvasElement | null) => {
      if (canvas) {
        canvasRefs.current[pageNum] = canvas;
        if (!loading) {
          renderPage(pageNum, canvas);
        }
      } else {
        delete canvasRefs.current[pageNum];
      }
    },
    [loading, renderPage]
  );

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--surface-inset, #181a1f)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Floating mobile zoom toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          background: "rgba(24, 26, 31, 0.88)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--rule-faint, rgba(255,255,255,0.08))",
          zIndex: 10,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: "0.75rem",
            fontFamily: "var(--font-mono, monospace)",
            color: "var(--quill-muted, #8b949e)",
          }}
        >
          {numPages > 0 ? `${numPages} page${numPages > 1 ? "s" : ""}` : "PDF Preview"}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={handleZoomOut}
            disabled={scaleMultiplier <= 0.5}
            title="Zoom out"
            style={{
              padding: "3px 8px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid var(--rule-soft, rgba(255,255,255,0.15))",
              borderRadius: "var(--r-xs, 3px)",
              color: "var(--quill-secondary, #c9d1d9)",
              fontSize: "0.75rem",
              fontWeight: "bold",
              cursor: scaleMultiplier <= 0.5 ? "not-allowed" : "pointer",
              opacity: scaleMultiplier <= 0.5 ? 0.4 : 1,
            }}
          >
            −
          </button>

          <button
            onClick={handleZoomReset}
            title="Reset to Fit Width"
            style={{
              padding: "3px 8px",
              background: scaleMultiplier === 1.0 ? "rgba(200,169,110,0.15)" : "rgba(255,255,255,0.06)",
              border: scaleMultiplier === 1.0 ? "1px solid rgba(200,169,110,0.4)" : "1px solid var(--rule-soft, rgba(255,255,255,0.15))",
              borderRadius: "var(--r-xs, 3px)",
              color: scaleMultiplier === 1.0 ? "var(--lamp, #c8a96e)" : "var(--quill-secondary, #c9d1d9)",
              fontSize: "0.6875rem",
              fontFamily: "var(--font-mono, monospace)",
              cursor: "pointer",
            }}
          >
            {Math.round(scaleMultiplier * 100)}%
          </button>

          <button
            onClick={handleZoomIn}
            disabled={scaleMultiplier >= 3.0}
            title="Zoom in"
            style={{
              padding: "3px 8px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid var(--rule-soft, rgba(255,255,255,0.15))",
              borderRadius: "var(--r-xs, 3px)",
              color: "var(--quill-secondary, #c9d1d9)",
              fontSize: "0.75rem",
              fontWeight: "bold",
              cursor: scaleMultiplier >= 3.0 ? "not-allowed" : "pointer",
              opacity: scaleMultiplier >= 3.0 ? 0.4 : 1,
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Scrollable canvas container */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "16px 8px 40px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        {loading && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: "40px 16px",
              color: "var(--quill-muted, #8b949e)",
              fontSize: "0.8125rem",
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                border: "2px solid rgba(200,169,110,0.2)",
                borderTopColor: "var(--lamp, #c8a96e)",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <span>Rendering PDF for mobile…</span>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: 16,
              background: "rgba(235, 87, 87, 0.08)",
              border: "1px solid rgba(235, 87, 87, 0.25)",
              borderRadius: "var(--r-sm, 4px)",
              color: "var(--ink-danger, #eb5757)",
              fontSize: "0.8125rem",
              textAlign: "center",
              maxWidth: 320,
              margin: "24px auto",
            }}
          >
            <p style={{ fontWeight: 600, marginBottom: 6 }}>Could not render preview</p>
            <p style={{ fontSize: "0.75rem", opacity: 0.85, marginBottom: 12 }}>{error}</p>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                padding: "6px 12px",
                background: "rgba(235, 87, 87, 0.15)",
                color: "#eb5757",
                borderRadius: "var(--r-xs, 3px)",
                fontSize: "0.75rem",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Open PDF directly ↗
            </a>
          </div>
        )}

        {!loading && !error && numPages > 0 && (
          Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
            <PageCanvas
              key={pageNum}
              pageNum={pageNum}
              numPages={numPages}
              onMount={handlePageMount}
            />
          ))
        )}
      </div>
    </div>
  );
}
