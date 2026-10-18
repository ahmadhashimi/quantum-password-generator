import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { Button, Callout } from "@/components/ui";

/** A failed request with a retry; the message says what the browser could not do without it. */
export function LoadError({ title, children, onRetry }: { title: string; children: ReactNode; onRetry: () => void }) {
  return (
    <Callout tone="danger" role="alert" title={title}>
      <p>{children}</p>
      <div className="pt-2">
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw className="size-3.5" aria-hidden /> Try again
        </Button>
      </div>
    </Callout>
  );
}
