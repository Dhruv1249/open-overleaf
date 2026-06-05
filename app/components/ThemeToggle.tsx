"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("oo:theme");
      let t: "light" | "dark" =
        saved === "light" || saved === "dark"
          ? saved
          : window.matchMedia?.("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
      setTheme(t);
      document.documentElement.classList.remove("theme-light", "theme-dark");
      document.documentElement.classList.add(`theme-${t}`);
    } catch {
      // ignore SSR
    }
  }, []);

  const showToast = (msg: string) => {
    try {
      const el = document.createElement("div");
      el.className = "oo-toast";
      el.textContent = msg;
      document.body.appendChild(el);
      void el.offsetWidth;
      el.classList.add("show");
      setTimeout(() => el.classList.remove("show"), 2000);
      setTimeout(() => el.remove(), 2400);
    } catch {
      // ignore
    }
  };

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("oo:theme", next);
    } catch {
      // ignore
    }
    document.documentElement.classList.remove("theme-light", "theme-dark");
    document.documentElement.classList.add(`theme-${next}`);
    showToast(`${next === "dark" ? "🌙" : "☀️"} ${next} mode`);
  };

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="theme-toggle"
      data-theme={theme}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      <div className="knob" />
    </button>
  );
}
