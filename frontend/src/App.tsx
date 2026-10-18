import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { AdminDashboard } from "./components/AdminDashboard";
import { DrawPage } from "./components/DrawPage";
import { CallToAction, Story } from "./components/Story";
import { VerifyPage } from "./components/VerifyPage";
import { Assistant } from "./components/Assistant";
import { Generator, type Generated } from "./components/Generator";
import { Header } from "./components/Header";
import { History, type HistoryItem } from "./components/History";
import { HowItWorks } from "./components/HowItWorks";
import { SourcesPanel } from "./components/SourcesPanel";
import { StrengthChecker } from "./components/StrengthChecker";
import { useApi } from "./hooks/useApi";
import { useTheme } from "./hooks/useTheme";
import { apiGet } from "./lib/api";
import { useAppAuth } from "./lib/auth";
import type { Me, PublicConfig } from "./lib/types";

const HISTORY_LIMIT = 10;
const RECEIPT_ID = /^[A-Za-z0-9_-]{1,64}$/;

function receiptIdFrom(route: string): string {
  try {
    const id = decodeURIComponent(route.slice("#/verify/".length));
    return RECEIPT_ID.test(id) ? id : "";
  } catch {
    return ""; // malformed percent-encoding must not crash the app
  }
}

function useHashRoute() {
  const [route, setRoute] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export default function App() {
  const { theme, toggle } = useTheme();
  const route = useHashRoute();
  const { signedIn, getToken } = useAppAuth();
  const { data: config } = useApi(() => apiGet<PublicConfig>("/api/v2/config"));
  const { data: me } = useApi(
    () => (signedIn ? apiGet<Me>("/api/v2/me", undefined, getToken) : Promise.resolve(null)),
    [signedIn],
  );
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const addToHistory = useCallback((g: Generated) => {
    setHistory((h) => [{ ...g, id: crypto.randomUUID(), at: new Date() }, ...h].slice(0, HISTORY_LIMIT));
  }, []);

  const needsSignIn = !!config?.assistant_requires_sign_in && !signedIn && !!config?.auth_enabled;

  return (
    <div className="bg-aurora min-h-dvh">
      <Header
        theme={theme}
        onToggleTheme={toggle}
        onOpenAssistant={config?.assistant_enabled ? () => setAssistantOpen(true) : undefined}
        isAdmin={!!me?.is_admin}
      />

      <main className="mx-auto max-w-6xl space-y-16 px-4 py-10 sm:py-16">
        {route === "#/admin" ? (
          <AdminDashboard />
        ) : route === "#/draw" ? (
          <DrawPage />
        ) : route.startsWith("#/verify") ? (
          <VerifyPage receiptId={receiptIdFrom(route)} />
        ) : (
          <>
            <div className="mx-auto max-w-3xl space-y-5 text-center">
              <p className="text-sm font-medium tracking-wide text-cyan-600 uppercase dark:text-cyan-400">
                Real quantum entropy · post-quantum cryptography
              </p>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Secrets built for the <span className="text-gradient">quantum era</span>
              </h1>
              <p className="text-lg text-slate-600 dark:text-slate-400">
                Passwords, passphrases and keys seeded by qubits on real IBM quantum computers, health-tested, mixed
                with your system's secure RNG — and sealed with a lattice-based (ML-DSA) signature that proves where
                every bit came from.
              </p>
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <a href="#generate" className="btn-primary px-5 py-3">
                  Generate a quantum password <ArrowRight className="size-4" aria-hidden />
                </a>
                <a href="#/draw" className="btn-ghost px-5 py-3">Run a provably fair draw</a>
              </div>
            </div>

            <div id="generate" className="grid scroll-mt-24 gap-6 lg:grid-cols-[1fr_22rem]">
              <div className="space-y-6">
                <Generator onGenerated={addToHistory} />
                <History items={history} onClear={() => setHistory([])} />
              </div>
              <div className="space-y-6">
                <SourcesPanel />
                <StrengthChecker />
              </div>
            </div>

            <Story />
            <HowItWorks />
            <CallToAction />
          </>
        )}
      </main>

      <footer className="border-t border-slate-200/60 py-8 text-center text-sm text-slate-500 dark:border-white/5">
        Built by <strong>Mujtaba Hashimi</strong> · v{config?.version ?? "2"} · Diceware words © EFF (CC BY 3.0 US)
      </footer>

      {config?.assistant_enabled && (
        <Assistant open={assistantOpen} onClose={() => setAssistantOpen(false)} needsSignIn={needsSignIn} />
      )}
    </div>
  );
}
