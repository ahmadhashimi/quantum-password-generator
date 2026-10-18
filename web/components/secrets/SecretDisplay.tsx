"use client";

import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useClipboard } from "@/lib/hooks/useClipboard";

/**
 * Shows a freshly generated secret. Client-only state: the value never enters a URL, the server-rendered HTML or an
 * RSC payload. Not a live region (screen readers would read the secret aloud); a status line announces "copied".
 */
export function SecretDisplay({ value, placeholder, label = "Generated secret" }: {
  value: string | null;
  placeholder: string;
  label?: string;
}) {
  const [hidden, setHidden] = useState(false);
  const { copied, copy } = useClipboard();
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface-sunken p-2 pl-4">
      <output aria-label={label} data-testid="secret"
              className={cn("block min-h-12 flex-1 py-2.5 font-mono text-lg break-all sm:text-xl",
                            value ? "text-fg" : "text-subtle")}>
        {value ? (hidden ? "•".repeat(Math.min(value.length, 32)) : value) : placeholder}
      </output>
      {value && (
        <>
          <Button variant="ghost" size="icon" onClick={() => setHidden((h) => !h)}
                  aria-label={hidden ? "Show secret" : "Hide secret"}>
            {hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </Button>
          <Button size="icon" onClick={() => void copy(value)} aria-label="Copy to clipboard">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
          <span role="status" className="sr-only">{copied ? "Copied. The clipboard clears in 30 seconds." : ""}</span>
        </>
      )}
    </div>
  );
}
