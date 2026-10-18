"use client";
import { useState, type ReactNode } from "react";
import { Header } from "./Header";
import { Assistant } from "./Assistant";
import { useAppAuth } from "../lib/auth";
import { apiGet } from "../lib/api";
import { useApi } from "../hooks/useApi";
import { useTheme } from "../hooks/useTheme";
import type { Me, PublicConfig } from "../lib/types";

export function SiteShell({ children }: { children: ReactNode }) {
  const { theme, toggle } = useTheme();
  const { getToken, signedIn } = useAppAuth();
  const { data: config } = useApi(() => apiGet<PublicConfig>("/api/v2/config"));
  const { data: me } = useApi(() => signedIn
      ? apiGet<Me>("/api/v2/me", undefined, getToken) : Promise.resolve(null), [signedIn]);
  const [assistantOpen, setAssistantOpen] = useState(false);
  return <div className="bg-aurora min-h-dvh">
    <Header theme={theme} onToggleTheme={toggle} isAdmin={!!me?.is_admin}
      onOpenAssistant={config?.assistant_enabled ? () => setAssistantOpen(true) : undefined}/>
    <main className="mx-auto max-w-6xl px-4 py-10 sm:py-16">{children}</main>
    <footer className="border-t border-slate-200/60 p-6 text-center text-sm text-slate-500 dark:border-white/5">
      QuantumPass · V2.1 preview · Signed evidence is not independent quantum attestation
    </footer>
    {config?.assistant_enabled && <Assistant open={assistantOpen}
      onClose={() => setAssistantOpen(false)}
      needsSignIn={!!config.assistant_requires_sign_in && !signedIn}/>}
  </div>;
}
