"use client";

import { Gauge, LayoutDashboard, ReceiptText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/receipts", label: "Receipts", icon: ReceiptText },
  { href: "/dashboard/usage", label: "Usage", icon: Gauge },
] as const;

/** Sub-navigation for the account area. Prefetch is off: these pages hold per-user data. */
export function DashboardNav() {
  const pathname = usePathname();
  const active = (href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href));
  return (
    <nav aria-label="Account" className="-mx-4 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const current = active(href);
          return (
            <li key={href}>
              <Link href={href} prefetch={false} aria-current={current ? "page" : undefined}
                    className={cn("-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition",
                                  current ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}>
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
