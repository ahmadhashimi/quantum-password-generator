import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "../lib/auth";
import { SiteShell } from "../components/SiteShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "QuantumPass — Verifiable Secret Issuance",
  description: "Strong secret generation with hybrid post-quantum signed receipts and transparent limits.",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" suppressHydrationWarning>
    <body><AuthProvider><SiteShell>{children}</SiteShell></AuthProvider></body>
  </html>;
}
