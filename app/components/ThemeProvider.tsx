"use client";

import { useEffect } from "react";

export default function ThemeProvider() {
  useEffect(() => {
    try {
      const saved = localStorage.getItem("oo:theme");
      let theme = saved as "light" | "dark" | null;
      if (!theme) {
        const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
        theme = prefersLight ? "light" : "dark";
      }
      document.documentElement.classList.remove("theme-light", "theme-dark");
      document.documentElement.classList.add(`theme-${theme}`);
    } catch (e) {
      // ignore
    }
  }, []);

  return null;
}
