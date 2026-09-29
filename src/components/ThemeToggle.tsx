"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";

export type Theme = "light" | "dark";

/**
 * Apply a theme class to <html> and persist it. The GhostFibers canvas,
 * background softener, and all CSS variables key off html.light / html.dark.
 */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  localStorage.setItem("alu_theme", theme);
  // Notify GhostFibers (and anything else listening) so the fiber
  // colors retune live without a remount.
  window.dispatchEvent(new CustomEvent<Theme>("alu-theme-change", { detail: theme }));
}

export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = localStorage.getItem("alu_theme");
  return saved === "light" || saved === "dark" ? saved : "dark";
}

/** Sun/moon toggle. Renders an icon-only round button matching the sidebar style. */
export default function ThemeToggle({
  className = "",
  iconSize = 16,
}: {
  className?: string;
  iconSize?: number;
}) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(getInitialTheme());
    const onChange = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener("alu-theme-change", onChange);
    return () => window.removeEventListener("alu-theme-change", onChange);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  const isDark = theme === "dark";
  return (
    <button
      onClick={toggle}
      className={className}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      type="button"
    >
      <Icon name={isDark ? "sun" : "moon"} size={iconSize} />
    </button>
  );
}
