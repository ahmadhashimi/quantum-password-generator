"use client";

import { Loader2, RotateCcw, Shuffle } from "lucide-react";
import type { ReactNode } from "react";

import { Button, Card, CardBody, CardHeader } from "@/components/ui";

import { PhaseTitle } from "./PhaseTitle";

/** Step 2: the single action that draws. Retries are safe: the draw can only run once. */
export function RunPanel({ busy, status, focusTitle, onRun, onStartOver }: {
  busy: boolean;
  /** Errors, conflicts and sign-in prompts from the last attempt. */
  status: ReactNode;
  focusTitle: boolean;
  onRun: () => void;
  onStartOver: () => void;
}) {
  return (
    <Card>
      <CardHeader icon={<Shuffle />} title={<PhaseTitle focus={focusTitle}>2. Run the draw</PhaseTitle>}
                  description="The server gathers entropy, saves the selection seed, then picks winners from the committed list." />
      <CardBody className="space-y-5">
        <p className="text-sm text-muted">
          For the strongest evidence, post the commitment link above before you run. A draw runs once: once it has
          run, pressing the button again or retrying after a network error returns the stored result instead of
          drawing again.
        </p>
        {status}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button size="lg" onClick={onRun} disabled={busy} className="w-full sm:w-auto">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Shuffle className="size-4" aria-hidden />}
            {busy ? "Running…" : "Run the draw"}
          </Button>
          <Button variant="ghost" onClick={onStartOver} disabled={busy} className="w-full sm:w-auto">
            <RotateCcw className="size-4" aria-hidden /> Start over
          </Button>
        </div>
        <p className="text-xs text-subtle">
          Starting over leaves this commitment unused: this page can&apos;t resume it afterwards.
        </p>
      </CardBody>
    </Card>
  );
}
