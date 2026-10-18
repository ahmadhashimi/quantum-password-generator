"use client";

import { Loader2, Lock } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useMemo, useState } from "react";

import { Button, Callout, Card, CardBody, CardHeader, Field, Input, Textarea } from "@/components/ui";

import {
  type DrawBody, LINE_MESSAGES, listProblems, MAX_ENTRIES, MAX_ENTRY_CHARS, MAX_TITLE_CHARS, MAX_WINNERS, parseEntries,
  parseWinners, TITLE_MESSAGES, cleanTitle,
} from "./entries";
import { PhaseTitle } from "./PhaseTitle";

const SHOWN = 5;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function lineList(lines: number[]): string {
  const shown = lines.slice(0, 6).join(", ");
  return lines.length > 6 ? `${shown} and ${lines.length - 6} more` : shown;
}

function Count({ label, value, tone }: { label: string; value: number; tone?: "warning" | "danger" | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-mono tabular-nums ${tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-fg"}`}>
        {value.toLocaleString("en-US")}
      </dd>
    </div>
  );
}

/** Step 1: title, entries and winner count, with a live preview of exactly what will be committed. */
export function CommitForm({ busy, status, focusTitle, onSubmit }: {
  busy: boolean;
  /** Errors and sign-in prompts for the last attempt, shown next to the submit button. */
  status: ReactNode;
  focusTitle: boolean;
  onSubmit: (body: DrawBody) => void;
}) {
  const blockerId = useId();
  const [titleRaw, setTitleRaw] = useState("");
  const [entriesRaw, setEntriesRaw] = useState("");
  const [winnersRaw, setWinnersRaw] = useState("1");

  const title = cleanTitle(titleRaw);
  const parsed = useMemo(() => parseEntries(entriesRaw), [entriesRaw]);
  const count = parsed.entries.length;
  const maxWinners = Math.min(count, MAX_WINNERS);
  const winners = parseWinners(winnersRaw, count);
  const listErrors = listProblems(parsed);

  const titleError = titleRaw.trim() && !title.ok && title.problem !== "empty" ? TITLE_MESSAGES[title.problem] : undefined;
  const winnersError = winnersRaw.trim() && count > 0 && winners === null
    ? `Enter a whole number from 1 to ${maxWinners}.` : undefined;

  const blocker = !title.ok ? (titleError ? "Fix the title to continue." : "Add a title.")
    : parsed.invalid.length > 0 ? "Fix the highlighted lines."
    : parsed.duplicates.length > 0 ? "Remove the duplicate entries to continue."
    : count === 0 ? "Add at least one entry."
    : (listErrors[0] ?? (winners === null ? `Choose between 1 and ${maxWinners} winners.` : null));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (blocker !== null || busy || !title.ok || winners === null) return;
    onSubmit({ title: title.value, entries: parsed.entries, winners });
  }

  return (
    <Card>
      <CardHeader icon={<Lock />} title={<PhaseTitle focus={focusTitle}>1. Commit your entries</PhaseTitle>}
                  description="The list is fingerprinted and signed before any randomness exists." />
      <CardBody>
        <form onSubmit={submit} noValidate className="space-y-6">
          {/* On mobile the preview sits right under the entries; from lg it fills the right column. */}
          <div className="grid gap-x-8 gap-y-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr_auto]">
            <Field className="lg:col-start-1" label="Draw title" error={titleError}
                   hint={`Shown on both receipts. Up to ${MAX_TITLE_CHARS} characters; links are not allowed.`}>
              {({ id, describedBy, invalid }) => (
                <Input id={id} value={titleRaw} onChange={(e) => setTitleRaw(e.target.value)} autoComplete="off"
                       placeholder="Launch week giveaway" aria-describedby={describedBy} aria-invalid={invalid}
                       aria-required />
              )}
            </Field>
            <Field className="lg:col-start-1" label="Entries"
                   hint="One per line. Empty lines are ignored; duplicates are matched ignoring upper and lower case.">
              {({ id, describedBy }) => (
                <Textarea id={id} value={entriesRaw} onChange={(e) => setEntriesRaw(e.target.value)} rows={10}
                          spellCheck={false} autoComplete="off" aria-describedby={describedBy} aria-required
                          placeholder={"alice\nbob\ncarol"} className="font-mono" />
              )}
            </Field>
            <aside aria-label="Entry preview"
                   className="space-y-4 self-start rounded-lg border border-border bg-surface-sunken p-4
                              lg:col-start-2 lg:row-span-3 lg:row-start-1">
              <div role="status" className="space-y-4">
                <p className="text-sm text-muted">
                  <span className="text-2xl font-semibold tabular-nums text-fg">{count.toLocaleString("en-US")}</span>{" "}
                  {count === 1 ? "entry" : "entries"} will be committed
                </p>
                <dl className="space-y-1.5 border-t border-border pt-3">
                  <Count label="Empty lines ignored" value={parsed.emptyLines} />
                  <Count label="Duplicates" value={parsed.duplicates.length}
                         tone={parsed.duplicates.length ? "warning" : undefined} />
                  {parsed.invalid.length > 0 && <Count label="Invalid lines" value={parsed.invalid.length} tone="danger" />}
                </dl>
                {parsed.duplicates.length > 0 && (
                  <Callout tone="warning" title={`${plural(parsed.duplicates.length, "duplicate", "duplicates")} found`}>
                    <ul className="list-disc space-y-1 pl-4 break-words">
                      {parsed.duplicates.slice(0, SHOWN).map((g) => (
                        <li key={g.lines.join(",")}>&ldquo;{g.entry}&rdquo; on lines {lineList(g.lines)}</li>
                      ))}
                    </ul>
                    {parsed.duplicates.length > SHOWN && <p>and {parsed.duplicates.length - SHOWN} more.</p>}
                    <p>Remove them so every entry has the same chance.</p>
                  </Callout>
                )}
                {parsed.invalid.length > 0 && (
                  <Callout tone="danger" title="Some lines can't be used">
                    <ul className="list-disc space-y-1 pl-4">
                      {parsed.invalid.slice(0, SHOWN).map((l) => (
                        <li key={l.line}>Line {l.line} {LINE_MESSAGES[l.problem]}</li>
                      ))}
                    </ul>
                    {parsed.invalid.length > SHOWN && <p>and {parsed.invalid.length - SHOWN} more.</p>}
                  </Callout>
                )}
                {listErrors.length > 0 && <Callout tone="danger">{listErrors.join(" ")}</Callout>}
              </div>
              <ul className="space-y-2 border-t border-border pt-3 text-xs text-muted">
                <li>
                  Entries are sorted before they are fingerprinted, so the order you type them in doesn&apos;t matter.
                  Winners are reported by position in that sorted list.
                </li>
                <li>
                  Entries are sent to the server so it can run the draw. The result receipt publishes the winning
                  entries, so use handles or ticket numbers rather than private details. Up to{" "}
                  {MAX_ENTRIES.toLocaleString("en-US")} entries of {MAX_ENTRY_CHARS} characters each.
                </li>
              </ul>
            </aside>
            <Field className="lg:col-start-1" label="Winners" error={winnersError}
                   hint={count > 0 ? `1 to ${maxWinners}.`
                                   : `At least 1 and at most the number of entries (up to ${MAX_WINNERS}).`}>
              {({ id, describedBy, invalid }) => (
                <Input id={id} type="number" inputMode="numeric" min={1} max={Math.max(1, maxWinners)} step={1}
                       value={winnersRaw} onChange={(e) => setWinnersRaw(e.target.value)} className="max-w-32"
                       aria-describedby={describedBy} aria-invalid={invalid} aria-required />
              )}
            </Field>
          </div>

          {status}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p id={blockerId} className="text-sm text-muted">
              {blocker ?? "Ready to commit. The list can't be edited afterwards."}
            </p>
            <Button type="submit" size="lg" disabled={busy || blocker !== null} aria-describedby={blockerId}
                    className="w-full sm:w-auto">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Lock className="size-4" aria-hidden />}
              {busy ? "Committing…" : "Commit entries"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
