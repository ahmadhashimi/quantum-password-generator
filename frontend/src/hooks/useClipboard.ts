import { useCallback, useEffect, useRef, useState } from "react";

const CLEAR_AFTER_MS = 30_000;

/**
 * Copy text, show a short "copied" state, and wipe the clipboard after 30 s.
 * Browsers only allow clipboard writes from a focused page, so if the user has switched away the wipe waits
 * until they come back — and only clears the clipboard if it still holds our secret (when readable).
 */
export function useClipboard() {
  const [copied, setCopied] = useState(false);
  const timers = useRef<number[]>([]);
  const pending = useRef<string | null>(null);

  const wipe = useCallback(async () => {
    const secret = pending.current;
    if (secret === null) return;
    if (!document.hasFocus()) {
      window.addEventListener("focus", () => void wipe(), { once: true });
      return;
    }
    try {
      const current = await navigator.clipboard.readText().catch(() => secret);
      if (current === secret) await navigator.clipboard.writeText("");
      pending.current = null;
    } catch {
      /* clipboard unavailable */
    }
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const copy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    pending.current = text;
    setCopied(true);
    timers.current.forEach(clearTimeout);
    timers.current = [
      window.setTimeout(() => setCopied(false), 1500),
      window.setTimeout(() => void wipe(), CLEAR_AFTER_MS),
    ];
  }, [wipe]);

  return { copied, copy };
}
