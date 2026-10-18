"use client";

import { Check, Copy, History, Trash2 } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";

import { Button, Card, CardBody, CardHeader } from "@/components/ui";
import { maskSecret } from "@/lib/format";
import { useClipboard } from "@/lib/hooks/useClipboard";

export type SecretKind = "password" | "passphrase" | "random";

export interface HistoryEntry {
  id: number;
  kind: SecretKind;
  /** Held in memory only, so "copy" works. Never rendered unmasked, stored or sent anywhere. */
  value: string;
  entropyBits: number;
  quantum: boolean;
  at: number;
}

export const HISTORY_LIMIT = 10;
/** Below this length, showing the first 3 and last 2 characters would give away too large a share of the secret. */
const PARTIAL_MASK_MIN = 16;

interface SessionHistoryApi {
  entries: readonly HistoryEntry[];
  add: (entry: Omit<HistoryEntry, "id" | "at">) => void;
  clear: () => void;
}

const NO_HISTORY: SessionHistoryApi = { entries: [], add: () => undefined, clear: () => undefined };
const HistoryContext = createContext<SessionHistoryApi>(NO_HISTORY);

/** Shares the last few results between the generator and the history panel. React state only: gone on reload. */
export function HistoryProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const nextId = useRef(0);
  const add = useCallback((entry: Omit<HistoryEntry, "id" | "at">) => {
    const next: HistoryEntry = { ...entry, id: ++nextId.current, at: Date.now() };
    setEntries((prev) => [next, ...prev].slice(0, HISTORY_LIMIT));
  }, []);
  const clear = useCallback(() => setEntries([]), []);
  const value = useMemo(() => ({ entries, add, clear }), [entries, add, clear]);
  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export const useSessionHistory = (): SessionHistoryApi => useContext(HistoryContext);

/** Fully masked when short; longer values show only their ends (lib/format.maskSecret). */
export const maskForHistory = (value: string): string =>
  value.length < PARTIAL_MASK_MIN ? "•".repeat(Math.min(value.length, 12)) : maskSecret(value);

const KIND_LABEL: Record<SecretKind, string> = { password: "Password", passphrase: "Passphrase", random: "Random key" };

const timeOf = (at: number): string =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function Row({ entry }: { entry: HistoryEntry }) {
  const { copied, copy } = useClipboard();
  const label = `${KIND_LABEL[entry.kind].toLowerCase()} from ${timeOf(entry.at)}`;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <code data-testid="history-value" className="block truncate text-sm text-fg">{maskForHistory(entry.value)}</code>
        <p className="mt-0.5 text-xs text-subtle">
          {KIND_LABEL[entry.kind]} · {entry.entropyBits.toFixed(0)} bits · {entry.quantum ? "Quantum-seeded" : "Not quantum"}
        </p>
      </div>
      <Button variant="ghost" size="icon" aria-label={`Copy ${label}`}
              onClick={() => copy(entry.value).catch(() => undefined)}>
        {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </Button>
      <span role="status" className="sr-only">{copied ? "Copied. The clipboard clears in 30 seconds." : ""}</span>
    </li>
  );
}

/** The last ten results of this tab, masked. Copy works from memory; nothing is persisted. */
export function SessionHistory() {
  const { entries, clear } = useSessionHistory();
  return (
    <Card>
      <CardHeader icon={<History />} title="This session"
                  description="Masked, kept in memory only, and gone when you reload or close the tab."
                  action={entries.length > 0 ? (
                    <Button variant="ghost" size="sm" onClick={clear}>
                      <Trash2 className="size-3.5" aria-hidden /> Clear
                    </Button>
                  ) : undefined} />
      <CardBody className="pt-2">
        {entries.length === 0 ? (
          <p className="py-4 text-sm text-subtle">Nothing generated yet.</p>
        ) : (
          <ul className="divide-y divide-border" aria-label="Generated this session">
            {entries.map((entry) => <Row key={entry.id} entry={entry} />)}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
