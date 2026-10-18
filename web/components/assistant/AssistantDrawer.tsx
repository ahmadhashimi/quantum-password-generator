"use client";

import { Bot, RotateCcw, Send, Sparkles, Square, Wrench, X } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { z } from "zod";

import { isAbortError, toShownError } from "@/components/generate/util";
import { ProvenanceNotice } from "@/components/generate/ProvenanceNotice";
import { ProvenanceBadge } from "@/components/receipts/ProvenanceBadge";
import { SecretDisplay } from "@/components/secrets/SecretDisplay";
import { Badge, Button, ButtonLink, Callout, Input, Skeleton } from "@/components/ui";
import { api, streamChat, type TokenGetter } from "@/lib/api/client";
import type { Provenance } from "@/lib/api/schemas";
import { useAppAuth } from "@/lib/auth/client";
import { cn } from "@/lib/cn";

type Body =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; name: string }
  | { kind: "secret"; secretKind: string; value: string; entropyBits: number; provenance: Provenance }
  | { kind: "error"; text: string }
  | { kind: "note"; text: string };

/** Items carry a counter id for React keys: never derived from a secret. */
type Item = Body & { id: number };

const SUGGESTIONS = [
  "Make me a strong password for my bank",
  "I need a memorable Wi-Fi passphrase",
  "Are the quantum sources online right now?",
];

const TOOL_LABELS: Record<string, string> = {
  generate_password: "Generating a password",
  generate_passphrase: "Generating a passphrase",
  entropy_status: "Checking source availability",
  estimate_crack_time: "Estimating crack time",
};

const Deleted = z.object({ ok: z.boolean() });

/** Best effort: the chat is gone from this browser either way, so failures are ignored. */
function forgetConversation(conversationId: string, getToken: TokenGetter): void {
  api(`/api/v2/assistant/conversations/${encodeURIComponent(conversationId)}`,
      { schema: Deleted, method: "DELETE", getToken }).catch(() => undefined);
}
const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])";

function ChatItem({ item }: { item: Item }) {
  switch (item.kind) {
    case "user":
      return (
        <p className="max-w-[85%] rounded-2xl rounded-br-sm border border-accent-2/30 bg-accent-2-soft px-4
                      py-2.5 text-sm break-words whitespace-pre-wrap text-fg">
          <span className="sr-only">You: </span>{item.text}
        </p>
      );
    case "assistant":
      return (
        <p className="max-w-[90%] rounded-2xl rounded-bl-sm border border-border bg-surface-sunken px-4 py-2.5
                      text-sm break-words whitespace-pre-wrap text-fg">
          <span className="sr-only">Assistant: </span>{item.text}
        </p>
      );
    case "tool":
      return (
        <p>
          <Badge icon={<Wrench aria-hidden />}>{TOOL_LABELS[item.name] ?? item.name.replace(/_/g, " ")}</Badge>
        </p>
      );
    case "secret":
      return (
        <div className="space-y-3 rounded-lg border border-accent/30 bg-accent-soft p-3">
          <SecretDisplay value={item.value} placeholder="" label={`Generated ${item.secretKind}`} />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <ProvenanceBadge provenance={item.provenance} />
            <span className="font-mono">{item.entropyBits.toFixed(1)} bits</span>
          </div>
          <ProvenanceNotice provenance={item.provenance} />
          <p className="text-xs text-muted">
            The assistant never sees this value: it went from the server straight to your browser. Copy it now, it is
            gone when you reset or close this chat.
          </p>
        </div>
      );
    case "error":
      return <Callout tone="danger" role="alert">{item.text}</Callout>;
    case "note":
      return <p className="text-xs text-subtle">{item.text}</p>;
  }
}

/** Right-side dialog for the security assistant. Closing it (the caller unmounts it) ends the chat. */
export function AssistantDrawer({ open, onClose, needsSignIn }: {
  open: boolean;
  onClose: () => void;
  needsSignIn: boolean;
}) {
  const auth = useAppAuth();
  const titleId = useId();
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationRef = useRef<string | null>(null);
  const nextId = useRef(0);
  const getTokenRef = useRef(auth.getToken);

  const checkingSession = needsSignIn && !auth.loaded;
  const blocked = needsSignIn && !auth.signedIn;

  useEffect(() => {
    getTokenRef.current = auth.getToken;
  });

  useEffect(() => () => {
    abortRef.current?.abort();
    if (conversationRef.current) forgetConversation(conversationRef.current, getTokenRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const root = dialogRef.current;
    const target = root?.querySelector<HTMLElement>("[data-autofocus]") ?? root?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();
  }, [open, blocked, checkingSession]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, busy]);

  const push = (body: Body) => setItems((prev) => [...prev, { ...body, id: ++nextId.current }]);

  const cancelStream = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy || blocked) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setInput("");
    setBusy(true);
    setAnnouncement("The assistant is working.");
    push({ kind: "user", text });
    try {
      for await (const ev of streamChat(text, conversationRef.current, auth.getToken, controller.signal)) {
        if (controller.signal.aborted) break;
        switch (ev.event) {
          case "conversation":
            conversationRef.current = ev.data.id;
            break;
          case "text":
            push({ kind: "assistant", text: ev.data.text });
            setAnnouncement("The assistant replied.");
            break;
          case "tool":
            push({ kind: "tool", name: ev.data.name });
            break;
          case "secret":
            push({ kind: "secret", secretKind: ev.data.kind, value: ev.data.value, entropyBits: ev.data.entropy_bits,
                   provenance: ev.data.provenance });
            setAnnouncement("A generated secret was added to the conversation. It is not read aloud.");
            break;
          case "error":
            push({ kind: "error", text: ev.data.message });
            break;
          case "done":
            break;
        }
      }
    } catch (e) {
      if (!isAbortError(e) && !controller.signal.aborted) push({ kind: "error", text: toShownError(e).message });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  };

  const stop = () => {
    cancelStream();
    push({ kind: "note", text: "Stopped." });
  };

  const reset = () => {
    cancelStream();
    if (conversationRef.current) forgetConversation(conversationRef.current, auth.getToken);
    conversationRef.current = null;
    setItems([]);
    setInput("");
    setAnnouncement("Conversation cleared.");
    dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  // Keep Tab inside the dialog: wrap from the last control to the first and back.
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Tab") return;
    const nodes = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!open || typeof document === "undefined") return null;

  // Portalled to <body>: the header's backdrop-filter would otherwise become the containing block of `fixed`.
  return createPortal(
    <>
      <div aria-hidden onClick={onClose} className="fixed inset-0 z-50 bg-bg/60 backdrop-blur-sm" />
      <aside ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}
             className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md translate-x-0 flex-col border-l border-border
                        bg-surface-raised shadow-pop transition-transform duration-300 starting:translate-x-full">
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 id={titleId} className="flex items-center gap-2 font-semibold text-fg">
            <Sparkles className="size-4 text-accent-2" aria-hidden /> Security assistant
          </h2>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={reset} disabled={blocked || (items.length === 0 && !busy)}>
              <RotateCcw className="size-3.5" aria-hidden /> Reset
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close assistant">
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {checkingSession ? (
            <div className="space-y-3" aria-hidden>
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : blocked ? (
            <Callout title="Sign in to use the assistant">
              <p>The assistant is available to signed-in accounts.</p>
              <ButtonLink href="/sign-in" size="sm" className="mt-3" data-autofocus onClick={onClose}>
                Sign in
              </ButtonLink>
            </Callout>
          ) : items.length === 0 ? (
            <div className="space-y-4 pt-4 text-center">
              <Bot className="mx-auto size-10 text-accent" aria-hidden />
              <p className="text-sm text-muted">
                Ask for a password, a passphrase or advice. Generated secrets appear directly in this panel, and the
                assistant never sees them. Do not paste real passwords here; use the strength checker on the Generate
                page, which runs locally.
              </p>
              <ul className="space-y-2 text-left">
                {SUGGESTIONS.map((s) => (
                  <li key={s}>
                    <button type="button" onClick={() => void send(s)}
                            className="w-full rounded-md border border-border-strong bg-surface-raised px-3 py-2
                                       text-left text-sm text-fg transition hover:bg-bg-subtle">
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ol aria-label="Conversation" className="space-y-3">
              {items.map((item) => (
                <li key={item.id} className={cn(item.kind === "user" && "flex justify-end")}>
                  <ChatItem item={item} />
                </li>
              ))}
            </ol>
          )}
          {busy && <p className="text-xs text-subtle" aria-hidden>Working…</p>}
          <p role="status" className="sr-only">{announcement}</p>
        </div>

        <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-border p-4">
          <Input value={input} onChange={(e) => setInput(e.target.value)} maxLength={2000}
                 disabled={blocked || checkingSession} placeholder="Ask the assistant…" aria-label="Message"
                 autoComplete="off" data-autofocus className="min-w-0 flex-1" />
          {busy ? (
            <Button variant="secondary" onClick={stop}><Square className="size-3.5 fill-current" aria-hidden /> Stop</Button>
          ) : (
            <Button type="submit" size="icon" aria-label="Send message"
                    disabled={blocked || checkingSession || !input.trim()}>
              <Send className="size-4" aria-hidden />
            </Button>
          )}
        </form>
      </aside>
    </>,
    document.body,
  );
}
