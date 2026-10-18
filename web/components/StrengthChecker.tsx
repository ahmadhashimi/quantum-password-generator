"use client";
import { Lock, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

interface Feedback {
  score: number;
  crackTime: string;
  warning: string;
  suggestions: string[];
}

const SCORE_LABELS = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];
const SCORE_COLORS = ["bg-rose-500", "bg-rose-400", "bg-amber-500", "bg-emerald-500", "bg-cyan-400"];

/** zxcvbn is ~800 KB of dictionaries, so it loads only when someone opens the checker. */
async function loadZxcvbn() {
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

let checkerPromise: ReturnType<typeof loadZxcvbn> | null = null;
const getChecker = () => (checkerPromise ??= loadZxcvbn());

export function StrengthChecker() {
  const [value, setValue] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    if (!value) {
      setFeedback(null);
      return;
    }
    let cancelled = false;
    getChecker().then((checker) => {
      if (cancelled) return;
      const r = checker.check(value);
      setFeedback({
        score: r.score,
        crackTime: r.crackTimes.offlineFastHashingXPerSecond.display,
        warning: r.feedback.warning ?? "",
        suggestions: r.feedback.suggestions,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <section className="glass space-y-4 p-6" aria-labelledby="checker-title">
      <h2 id="checker-title" className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="size-4 text-cyan-500" aria-hidden /> Check a password
      </h2>
      <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <Lock className="size-3" aria-hidden /> Runs entirely in your browser — nothing is sent anywhere.
      </p>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Type a password to test"
        aria-label="Password to check"
        className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 font-mono outline-none focus:ring-2 focus:ring-cyan-400 dark:border-white/10 dark:bg-black/30"
      />
      {feedback && (
        <div className="space-y-2 text-sm">
          <div className="flex gap-1" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= feedback.score ? SCORE_COLORS[feedback.score] : "bg-slate-200 dark:bg-white/10"}`} />
            ))}
          </div>
          <p>
            <strong>{SCORE_LABELS[feedback.score]}</strong> · cracked in {feedback.crackTime} offline
          </p>
          {feedback.warning && <p className="text-amber-600 dark:text-amber-300">{feedback.warning}</p>}
          {feedback.suggestions.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-slate-500 dark:text-slate-400">
              {feedback.suggestions.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
