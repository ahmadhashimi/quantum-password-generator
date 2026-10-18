"use client";

import type { Score } from "@zxcvbn-ts/core";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { Button, Callout, Card, CardBody, CardHeader, Field, Input } from "@/components/ui";
import { cn } from "@/lib/cn";

interface Feedback {
  score: Score;
  crackTime: string;
  warning: string;
  suggestions: string[];
}

const LEVELS = [
  { label: "Very weak", fill: "bg-danger" },
  { label: "Weak", fill: "bg-danger" },
  { label: "Fair", fill: "bg-warning" },
  { label: "Strong", fill: "bg-success" },
  { label: "Very strong", fill: "bg-success" },
] as const;

/** zxcvbn's guess model only reads the first 100 characters; longer input is scored on that prefix. */
const MAX_CHECKED = 100;
const DEBOUNCE_MS = 120;

/** zxcvbn is ~800 KB of dictionaries, so it loads only when someone starts typing. */
async function loadChecker() {
  const [{ ZxcvbnFactory }, common, en] = await Promise.all([
    import("@zxcvbn-ts/core"),
    import("@zxcvbn-ts/language-common"),
    import("@zxcvbn-ts/language-en"),
  ]);
  return new ZxcvbnFactory({
    dictionary: { ...common.dictionary, ...en.dictionary },
    graphs: common.adjacencyGraphs,
    translations: en.translations,
  });
}

let checkerPromise: ReturnType<typeof loadChecker> | null = null;
function getChecker() {
  checkerPromise ??= loadChecker().catch((e: unknown) => {
    checkerPromise = null; // allow a retry on the next keystroke
    throw e;
  });
  return checkerPromise;
}

/** Local-only password strength estimate. The typed value never leaves this component's state. */
export function StrengthChecker() {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!value) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      getChecker().then((checker) => {
        if (cancelled) return;
        const r = checker.check(value.slice(0, MAX_CHECKED));
        // Keep only derived fields: the full result echoes the password and its matched pattern.
        setFailed(false);
        setFeedback({ score: r.score, crackTime: r.crackTimes.offlineFastHashingXPerSecond.display,
                      warning: r.feedback.warning ?? "", suggestions: r.feedback.suggestions });
      }, () => {
        if (!cancelled) setFailed(true);
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value]);

  const shown = value ? feedback : null;
  const level = shown ? LEVELS[shown.score] : null;

  return (
    <Card>
      <CardHeader icon={<ShieldCheck />} title="Check a password"
                  description="Runs entirely in your browser. Nothing you type is sent anywhere." />
      <CardBody className="space-y-4">
        <Field label="Password to check">
          {({ id, describedBy }) => (
            <div className="relative">
              <Input id={id} aria-describedby={describedBy} type={show ? "text" : "password"} value={value}
                     onChange={(e) => {
                       setValue(e.target.value);
                       if (!e.target.value) setFeedback(null);
                     }}
                     autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                     data-lpignore="true" data-1p-ignore="true" placeholder="Type a password to test"
                     className="pr-12 font-mono" />
              <Button variant="ghost" size="icon" aria-label="Show password" aria-pressed={show}
                      className="absolute top-1/2 right-1 -translate-y-1/2" onClick={() => setShow((v) => !v)}>
                {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </Button>
            </div>
          )}
        </Field>

        {failed && value && (
          <Callout tone="danger" role="alert">The strength checker could not be loaded. Try typing again.</Callout>
        )}
        {!failed && value && !shown && <p className="text-xs text-subtle">Loading the checker…</p>}

        {shown && level && (
          <div className="space-y-3 text-sm">
            <div role="meter" aria-label="Password strength" aria-valuemin={0} aria-valuemax={4}
                 aria-valuenow={shown.score} aria-valuetext={level.label} className="flex gap-1">
              {LEVELS.map((l, i) => (
                <div key={l.label} aria-hidden
                     className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= shown.score ? level.fill : "bg-bg-subtle")} />
              ))}
            </div>
            <p role="status">
              <strong className="font-semibold text-fg">{level.label}</strong>
              <span className="text-muted"> · estimated offline crack time (fast hash): {shown.crackTime}</span>
            </p>
            {shown.warning && <Callout tone="warning">{shown.warning}</Callout>}
            {shown.suggestions.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-muted">
                {shown.suggestions.map((s) => <li key={s}>{s}</li>)}
              </ul>
            )}
            <p className="text-xs text-subtle">
              A heuristic estimate of how guessable a password is from common words, patterns and leaks. It is not a
              guarantee.
              {value.length > MAX_CHECKED && ` Only the first ${MAX_CHECKED} characters were scored.`}
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
