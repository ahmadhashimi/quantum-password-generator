"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui";

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, () => document.documentElement.classList.contains("dark"), () => null);
  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* storage blocked */
    }
  };
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle colour theme">
      {dark === false ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  );
}

/** Runs before hydration (nonce'd inline script in the root layout) so the page never flashes the wrong theme. */
export const THEME_SCRIPT =
  "try{var t=localStorage.getItem('theme');var d=t?t==='dark':!matchMedia('(prefers-color-scheme: light)').matches;" +
  "document.documentElement.classList.toggle('dark',d)}catch(e){document.documentElement.classList.add('dark')}";
