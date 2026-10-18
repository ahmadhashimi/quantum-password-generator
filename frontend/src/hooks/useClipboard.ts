import { useCallback, useEffect, useRef, useState } from "react";

const CLEAR_AFTER_MS = 30_000;

/** Copy text, show a short "copied" state, and wipe the clipboard after 30 s. */
export function useClipboard() {
  const [copied, setCopied] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const copy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    timers.current.forEach(clearTimeout);
    timers.current = [
      window.setTimeout(() => setCopied(false), 1500),
      window.setTimeout(() => navigator.clipboard.writeText("").catch(() => undefined), CLEAR_AFTER_MS),
    ];
  }, []);

  return { copied, copy };
}
