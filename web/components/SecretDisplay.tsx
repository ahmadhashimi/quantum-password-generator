"use client";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";
import { useClipboard } from "../hooks/useClipboard";

export function SecretDisplay({ value, placeholder }: { value: string | null; placeholder: string }) {
  const [hidden, setHidden] = useState(false);
  const { copied, copy } = useClipboard();

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 pl-4 dark:border-white/10 dark:bg-black/30">
      <div className="min-h-12 flex-1 overflow-hidden py-2" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.code
            key={value ?? "empty"}
            initial={{ opacity: 0, filter: "blur(6px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            data-testid="secret"
            className={`block font-mono text-lg break-all sm:text-xl ${value ? "" : "text-slate-400 dark:text-slate-500"}`}
          >
            {value ? (hidden ? "•".repeat(Math.min(value.length, 32)) : value) : placeholder}
          </motion.code>
        </AnimatePresence>
      </div>
      {value && (
        <>
          <button type="button" className="btn-ghost size-10 p-0" onClick={() => setHidden((h) => !h)}
            aria-label={hidden ? "Show" : "Hide"}>
            {hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </button>
          <button type="button" className="btn-primary size-10 p-0" onClick={() => copy(value)}
            aria-label={copied ? "Copied" : "Copy to clipboard"}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </button>
        </>
      )}
    </div>
  );
}
