"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";

/** Code sample with a copy button. For public examples only — never for secrets (use SecretDisplay). */
export function CodeBlock({ code, language, className }: { code: string; language?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={cn("group relative overflow-hidden rounded-lg border border-border bg-surface-sunken", className)}>
      {language && (
        <div className="border-b border-border px-4 py-1.5 font-mono text-[0.7rem] tracking-wide text-subtle uppercase">
          {language}
        </div>
      )}
      <pre className="overflow-x-auto p-4 text-[0.8rem] leading-relaxed text-fg"><code>{code}</code></pre>
      <button type="button" aria-label="Copy code"
              onClick={async () => {
                await navigator.clipboard.writeText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="absolute top-2 right-2 rounded-md border border-border bg-surface-raised p-1.5 text-muted
                         opacity-0 transition group-hover:opacity-100 focus:opacity-100 hover:text-fg">
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}
