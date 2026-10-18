"use client";

import { LayoutDashboard, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { AssistantLauncher } from "@/components/assistant/AssistantLauncher";
import { Button, buttonClass } from "@/components/ui";
import { clerkEnabled } from "@/lib/auth/config";
import { cn } from "@/lib/cn";

import { AuthControls } from "./AuthControls";
import { Logo } from "./Logo";
import { PRIMARY_NAV } from "./nav";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50
                                 focus:rounded-md focus:bg-surface-raised focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-fg">
          <Logo /> <span>QuantumPass</span>
        </Link>
        <nav aria-label="Main" className="ml-4 hidden items-center gap-1 lg:flex">
          {PRIMARY_NAV.map((item) => (
            <Link key={item.href} href={item.href} prefetch={false} aria-current={active(item.href) ? "page" : undefined}
                  className={cn("rounded-md px-3 py-2 text-sm transition",
                                active(item.href) ? "bg-bg-subtle text-fg" : "text-muted hover:text-fg")}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <AssistantLauncher />
          <ThemeToggle />
          <div className="hidden items-center gap-1.5 sm:flex">
            {clerkEnabled ? <AuthControls /> : (
              <Link href="/dashboard" prefetch={false} className={buttonClass("ghost", "sm")}>
                <LayoutDashboard className="size-4" aria-hidden /> Dashboard
              </Link>
            )}
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-expanded={open} aria-controls="mobile-nav"
                  aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((o) => !o)}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-border px-4 pb-4 lg:hidden">
          <ul className="grid gap-1 pt-2">
            {[...PRIMARY_NAV, { href: "/status", label: "Status" }, { href: "/dashboard", label: "Dashboard" }].map((item) => (
              <li key={item.href}>
                <Link href={item.href} prefetch={false} onClick={() => setOpen(false)}
                      className="block rounded-md px-3 py-2 text-sm text-muted hover:bg-bg-subtle hover:text-fg">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          {clerkEnabled && <div className="mt-3 flex items-center gap-2 sm:hidden"><AuthControls /></div>}
        </nav>
      )}
    </header>
  );
}
