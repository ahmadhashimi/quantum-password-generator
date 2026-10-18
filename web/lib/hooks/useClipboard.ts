"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const CLEAR_AFTER_MS = 30_000;

function clearWhenFocused(pending: { current: boolean }): void {
  if (!pending.current) return;
  if (!document.hasFocus()) {
    window.addEventListener("focus", () => clearWhenFocused(pending), { once: true });
    return;
  }
  pending.current = false;
  navigator.clipboard.writeText("").catch(() => undefined);
}

/**
 * Copy a secret, show a short "copied" state, and clear the clipboard after 30 s (as password managers do).
 * Browsers only allow clipboard writes from a focused page, so if the user has switched away the clear waits until
 * they return. It never reads the clipboard, which would trigger a permission prompt.
 */
export function useClipboard() {
  const [copied, setCopied] = useState(false);
  const timers = useRef<number[]>([]);
  const pending = useRef(false);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const copy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    pending.current = true;
    setCopied(true);
    timers.current.forEach(clearTimeout);
    timers.current = [window.setTimeout(() => setCopied(false), 1500),
                      window.setTimeout(() => clearWhenFocused(pending), CLEAR_AFTER_MS)];
  }, []);

  return { copied, copy };
}
