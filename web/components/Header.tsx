"use client";
import { SignInButton, SignUpButton, UserButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { BarChart3, FileSearch, Gift, Moon, Sparkles, Sun } from "lucide-react";
import { useAppAuth } from "../lib/auth";

interface Props {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenAssistant?: () => void;
  isAdmin: boolean;
}

export function Header({ theme, onToggleTheme, onOpenAssistant, isAdmin }: Props) {
  const { enabled } = useAppAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/60 backdrop-blur-xl dark:border-white/5 dark:bg-[#070b16]/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <a href="/" className="flex items-center gap-2 font-semibold">
          <img src="/favicon.svg" alt="" className="size-7" />
          <span>Quantum<span className="text-gradient">Pass</span></span>
        </a>
        <nav className="flex items-center gap-2">
          <a href="/draws" className="btn-ghost h-9 px-3" aria-label="Quantum draw">
            <Gift className="size-4" aria-hidden /> <span className="hidden md:inline">Draw</span>
          </a>
          <a href="/verify" className="btn-ghost h-9 px-3" aria-label="Verify a receipt">
            <FileSearch className="size-4" aria-hidden /> <span className="hidden md:inline">Verify</span>
          </a>
          {isAdmin && (
            <a href="/admin" className="btn-ghost h-9 px-3" aria-label="Admin dashboard">
              <BarChart3 className="size-4" /> <span className="hidden sm:inline">Admin</span>
            </a>
          )}
          {onOpenAssistant && (
            <button type="button" onClick={onOpenAssistant} className="btn-ghost h-9 px-3">
              <Sparkles className="size-4 text-violet-400" aria-hidden /> <span className="hidden sm:inline">Assistant</span>
            </button>
          )}
          <button type="button" onClick={onToggleTheme} className="btn-ghost size-9 p-0" aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          {enabled && (
            <>
              <SignedOut>
                <SignInButton mode="modal">
                  <button type="button" className="btn-ghost h-9 px-4">Sign in</button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button type="button" className="btn-primary h-9 px-4">Sign up free</button>
                </SignUpButton>
              </SignedOut>
              <SignedIn>
                <UserButton />
              </SignedIn>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
