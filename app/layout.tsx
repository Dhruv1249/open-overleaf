import type { Metadata } from "next";
import "./globals.css";
import ThemeProvider from "./components/ThemeProvider";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Open Overleaf — GitHub-backed LaTeX IDE",
  description: "A single-user LaTeX IDE backed by GitHub. Write, compile, and preview documents with Monaco, LSP, and live PDF rendering.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <ThemeProvider />
        {children}
      </body>
    </html>
  );
}
