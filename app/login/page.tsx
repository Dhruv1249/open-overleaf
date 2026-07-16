"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function GitHubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 8 }}>
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      minHeight: "100vh",
      backgroundColor: "var(--ink-base)",
      color: "var(--quill-primary)",
      fontFamily: "var(--font-ui)",
    }}>
      {/* Left Column: Welcome and Login Action */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "var(--sp-12) var(--sp-10)",
        borderRight: "1px solid var(--rule-standard)",
        position: "relative",
      }}>
        {/* Soft amber glow decoration */}
        <div style={{
          position: "absolute",
          top: "10%",
          left: "5%",
          width: "250px",
          height: "250px",
          background: "var(--lamp-glow)",
          filter: "blur(80px)",
          borderRadius: "50%",
          pointerEvents: "none",
        }} />

        <div style={{ maxWidth: "460px", margin: "0 auto", width: "100%", zIndex: 1 }}>
          <div style={{ marginBottom: "var(--sp-8)" }}>
            <h1 style={{
              fontFamily: "var(--font-serif)",
              fontSize: "2.5rem",
              fontWeight: 500,
              lineHeight: 1.2,
              color: "var(--quill-primary)",
              marginBottom: "var(--sp-2)",
              letterSpacing: "-0.02em",
            }}>
              Open Overleaf
            </h1>
            <p style={{
              fontSize: "0.95rem",
              color: "var(--quill-secondary)",
              lineHeight: 1.6,
            }}>
              A lightweight, local-first LaTeX editor synchronized directly with GitHub. Access your academic papers and documents securely.
            </p>
          </div>

          {error && (
            <div style={{
              padding: "var(--sp-4)",
              backgroundColor: "var(--ink-danger-dim)",
              border: "1px solid var(--ink-danger)",
              borderRadius: "var(--r-md)",
              color: "var(--quill-primary)",
              fontSize: "0.85rem",
              marginBottom: "var(--sp-6)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}>
              <strong style={{ color: "var(--ink-danger)" }}>
                {error === "forbidden" ? "Access Denied" : "Authentication Error"}
              </strong>
              <span>
                {error === "forbidden"
                  ? "Your GitHub account is not authorized to access this instance. Please configure ALLOW_GITHUB_USERNAME."
                  : "An error occurred during GitHub authentication. Please try again."}
              </span>
            </div>
          )}

          <div style={{
            padding: "var(--sp-6)",
            backgroundColor: "var(--ink-raised)",
            border: "1px solid var(--rule-standard)",
            borderRadius: "var(--r-md)",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
          }}>
            <h2 style={{
              fontSize: "0.85rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--quill-tertiary)",
              marginBottom: "var(--sp-4)",
            }}>
              Authentication Required
            </h2>

            <a
              href="/api/auth/github/login"
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "var(--sp-4) var(--sp-6)",
                backgroundColor: isHovered ? "var(--quill-primary)" : "var(--ink-base)",
                color: isHovered ? "var(--ink-base)" : "var(--quill-primary)",
                border: "1px solid var(--rule-emphasis)",
                borderRadius: "var(--r-sm)",
                textDecoration: "none",
                fontSize: "0.95rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "all var(--t-fast) var(--ease-standard)",
                boxShadow: isHovered ? "0 4px 12px rgba(0, 0, 0, 0.15)" : "none",
              }}
            >
              <GitHubIcon />
              Sign in with GitHub
            </a>
          </div>

          <div style={{
            marginTop: "var(--sp-8)",
            fontSize: "0.75rem",
            color: "var(--quill-tertiary)",
            lineHeight: 1.5,
            borderTop: "1px solid var(--rule-soft)",
            paddingTop: "var(--sp-4)",
          }}>
            This instance is private. Once authenticated, your workspace will load files directly from your configured GitHub repository.
          </div>
        </div>
      </div>

      {/* Right Column: Premium Document Visual Preview */}
      <div style={{
        backgroundColor: "var(--ink-raised)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "var(--sp-12)",
        overflow: "hidden",
        position: "relative",
      }}>
        {/* Amber desk lamp glow overlay */}
        <div style={{
          position: "absolute",
          bottom: "10%",
          right: "10%",
          width: "350px",
          height: "350px",
          background: "var(--lamp-glow)",
          filter: "blur(100px)",
          borderRadius: "50%",
          pointerEvents: "none",
        }} />

        {/* Typeset Paper Card mockup */}
        <div style={{
          width: "100%",
          maxWidth: "460px",
          aspectRatio: "1 / 1.414", // A4 paper ratio
          backgroundColor: "#f5f0e8", // Parchment color
          color: "#0d0f14", // Dark ink
          padding: "var(--sp-8) var(--sp-10)",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25)",
          border: "1px solid rgba(200, 190, 170, 0.15)",
          borderRadius: "var(--r-xs)",
          display: "flex",
          flexDirection: "column",
          fontFamily: "var(--font-serif)",
          fontSize: "0.75rem",
          lineHeight: 1.6,
          zIndex: 1,
          transform: "rotate(1deg)",
          transition: "transform 0.5s var(--ease-standard)",
        }}>
          {/* Header metadata */}
          <div style={{
            textAlign: "center",
            marginBottom: "var(--sp-6)",
            borderBottom: "0.5px solid rgba(13, 15, 20, 0.15)",
            paddingBottom: "var(--sp-4)",
          }}>
            <span style={{ fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#555" }}>
              Manuscript draft &middot; Typeset with &alpha;
            </span>
          </div>

          {/* Document Title */}
          <div style={{ textAlign: "center", marginBottom: "var(--sp-4)" }}>
            <h3 style={{ fontSize: "1.2rem", fontWeight: "normal", margin: "0 0 var(--sp-2) 0", lineHeight: 1.2 }}>
              A Local-First Collaborative Environment for LaTeX Authors
            </h3>
            <div style={{ fontSize: "0.7rem", fontStyle: "italic", color: "#444" }}>
              Author Name &bull; Open Overleaf Project
            </div>
          </div>

          {/* Abstract */}
          <div style={{
            margin: "0 var(--sp-4) var(--sp-6) var(--sp-4)",
            padding: "var(--sp-2) var(--sp-3)",
            borderLeft: "2px solid #c8a96e",
            fontSize: "0.68rem",
            color: "#333",
          }}>
            <strong>Abstract.</strong> This document introduces Open Overleaf, a modern browser-based editor that integrates high-precision compilation with git-backed version control. By checking and validating credentials against your GitHub organization, we achieve absolute data confidentiality and secure synchronization.
          </div>

          {/* Section 1 */}
          <div style={{ marginBottom: "var(--sp-4)" }}>
            <h4 style={{ fontSize: "0.85rem", fontWeight: "bold", margin: "0 0 var(--sp-2) 0" }}>
              1. Introduction
            </h4>
            <p style={{ margin: 0, textIndent: "1.5em", textAlign: "justify" }}>
              Traditional cloud-based LaTeX editors require documents to be stored on remote, opaque databases. In contrast, our local-first implementation leverages GitHub as the source of truth, enabling authors to own their source files while benefiting from a web-based real-time preview.
            </p>
          </div>

          {/* Section 2 */}
          <div style={{ marginBottom: "var(--sp-4)" }}>
            <h4 style={{ fontSize: "0.85rem", fontWeight: "bold", margin: "0 0 var(--sp-2) 0" }}>
              2. Secure Architecture
            </h4>
            <p style={{ margin: 0, textIndent: "1.5em", textAlign: "justify" }}>
              Using HMAC SHA-256 signatures, the server guarantees session authenticity. Clients compile locally via our bridge, maintaining performance and security.
            </p>
          </div>

          {/* Footer page number */}
          <div style={{ marginTop: "auto", textAlign: "center", fontSize: "0.65rem", color: "#777" }}>
            1
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        backgroundColor: "var(--ink-base)",
        color: "var(--quill-secondary)",
        fontFamily: "var(--font-mono)",
      }}>
        Loading security module...
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
