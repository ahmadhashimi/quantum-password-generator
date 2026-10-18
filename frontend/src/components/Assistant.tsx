import { Bot, Loader2, Plus, Send, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { streamChat } from "../lib/api";
import { useAppAuth } from "../lib/auth";
import type { Secret } from "../lib/types";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { SecretDisplay } from "./SecretDisplay";

type Item =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; name: string }
  | { kind: "secret"; secret: Secret }
  | { kind: "error"; text: string };

const SUGGESTIONS = [
  "Make me a strong password for my bank",
  "I need a memorable Wi-Fi passphrase",
  "Are the quantum sources online right now?",
];

const TOOL_LABELS: Record<string, string> = {
  generate_password: "Generating password",
  generate_passphrase: "Generating passphrase",
  entropy_status: "Checking entropy sources",
  estimate_crack_time: "Estimating crack time",
};

interface Props {
  open: boolean;
  onClose: () => void;
  needsSignIn: boolean;
}

export function Assistant({ open, onClose, needsSignIn }: Props) {
  const { getToken } = useAppAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const conversationId = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [items]);
  useEffect(() => () => abort.current?.abort(), []);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setInput("");
    setBusy(true);
    setItems((prev) => [...prev, { kind: "user", text }]);
    abort.current = new AbortController();
    try {
      for await (const ev of streamChat(text, conversationId.current, getToken, abort.current.signal)) {
        switch (ev.event) {
          case "conversation":
            conversationId.current = ev.data.id;
            break;
          case "text":
            setItems((prev) => [...prev, { kind: "assistant", text: ev.data.text }]);
            break;
          case "tool":
            setItems((prev) => [...prev, { kind: "tool", name: ev.data.name }]);
            break;
          case "secret":
            setItems((prev) => [...prev, { kind: "secret", secret: ev.data }]);
            break;
          case "error":
            setItems((prev) => [...prev, { kind: "error", text: ev.data.message }]);
            break;
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setItems((prev) => [...prev, { kind: "error", text: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  const reset = () => {
    abort.current?.abort();
    conversationId.current = null;
    setItems([]);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white/90 backdrop-blur-2xl dark:border-white/10 dark:bg-[#0b1020]/95"
          aria-label="Quantum assistant"
        >
          <header className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-white/10">
            <h2 className="flex items-center gap-2 font-semibold">
              <Sparkles className="size-4 text-violet-400" aria-hidden /> Quantum assistant
            </h2>
            <div className="flex gap-1">
              <button type="button" onClick={reset} className="btn-ghost size-8 p-0" aria-label="New chat">
                <Plus className="size-4" />
              </button>
              <button type="button" onClick={onClose} className="btn-ghost size-8 p-0" aria-label="Close assistant">
                <X className="size-4" />
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {needsSignIn ? (
              <p className="rounded-xl bg-slate-100 p-4 text-sm dark:bg-white/5">Sign in to chat with the assistant.</p>
            ) : items.length === 0 ? (
              <div className="space-y-3 pt-6 text-center">
                <Bot className="mx-auto size-10 text-cyan-400" aria-hidden />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Ask for a password, a passphrase, or advice. Generated secrets appear here directly — the AI never sees them.
                </p>
                <div className="space-y-2 pt-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="btn-ghost w-full justify-start text-left">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              items.map((item, i) => <ChatItem key={i} item={item} />)
            )}
            {busy && (
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> Thinking…
              </p>
            )}
            <div ref={bottom} />
          </div>

          <form onSubmit={onSubmit} className="flex gap-2 border-t border-slate-200 p-4 dark:border-white/10">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={2000}
              disabled={needsSignIn}
              placeholder="Ask the assistant…"
              aria-label="Message"
              className="flex-1 rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-400 dark:border-white/10 dark:bg-black/30"
            />
            <button type="submit" className="btn-primary size-11 p-0" disabled={busy || needsSignIn || !input.trim()} aria-label="Send">
              <Send className="size-4" />
            </button>
          </form>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function ChatItem({ item }: { item: Item }) {
  switch (item.kind) {
    case "user":
      return <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm text-white">{item.text}</p>;
    case "assistant":
      return <p className="max-w-[90%] rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2 text-sm whitespace-pre-wrap dark:bg-white/5">{item.text}</p>;
    case "tool":
      return <p className="text-xs text-slate-500">⚛ {TOOL_LABELS[item.name] ?? item.name}…</p>;
    case "secret":
      return (
        <div className="space-y-2 rounded-2xl border border-cyan-500/30 p-3">
          <SecretDisplay value={item.secret.value} placeholder="" />
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <ProvenanceBadge provenance={item.secret.provenance} /> {item.secret.entropy_bits.toFixed(0)} bits
          </div>
        </div>
      );
    case "error":
      return <p role="alert" className="text-sm text-rose-500">{item.text}</p>;
  }
}
