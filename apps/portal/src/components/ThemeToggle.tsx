"use client";
import { useEffect, useState } from "react";
import { Sun, Moon } from "./icons";

type Theme = "light" | "dark";
const STORAGE_KEY = "gjg-theme";

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTheme(readTheme());

    // The bootstrap script keeps following the OS for as long as nobody has
    // chosen for themselves. Mirror those changes into the icon so the button
    // never claims the page is in a mode it isn't.
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      if (!localStorage.getItem(STORAGE_KEY)) setTheme(readTheme());
    };
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    // Writing this is what stops the OS overriding the choice later.
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }

  // An invisible placeholder until mounted, so the server markup matches what
  // the pre-hydration script produced and the row doesn't shift.
  if (!mounted) {
    return <span className="inline-block h-[42px] w-[52px]" aria-hidden />;
  }

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to day mode" : "Switch to night mode"}
      title={isDark ? "Day mode" : "Night mode"}
      className="dock-item tap inline-flex items-center justify-center rounded-full px-4 py-2.5 text-band/70 hover:bg-white/10 hover:text-band"
    >
      {/* Keyed so the icon swap animates rather than snapping. */}
      <span key={theme} className="pop inline-flex">
        {isDark ? <Sun size={17} /> : <Moon size={17} />}
      </span>
    </button>
  );
}
