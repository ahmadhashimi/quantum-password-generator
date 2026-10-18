import "./globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { Footer } from "@/components/shell/Footer";
import { Header } from "@/components/shell/Header";
import { THEME_SCRIPT } from "@/components/shell/ThemeToggle";
import { clerkEnabled } from "@/lib/auth/config";
import { ClerkAuthBridge, NoAuthBridge } from "@/lib/auth/client";

export const metadata: Metadata = {
  title: { default: "QuantumPass: quantum-assisted secrets with signed evidence", template: "%s · QuantumPass" },
  description: "Passwords, keys and fair draws seeded by quantum entropy, with post-quantum signed receipts that say " +
    "exactly what is proven and what is only asserted.",
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#060a14" }, { color: "#f6f8fc" }],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading the per-request nonce makes every page dynamic, which the CSP nonce requires anyway.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const shell = (
    <>
      <Header />
      <main id="main" className="min-h-[70vh]">{children}</main>
      <Footer />
    </>
  );
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {clerkEnabled ? (
          <ClerkProvider dynamic afterSignOutUrl="/" signInUrl="/sign-in" signUpUrl="/sign-up"
                         appearance={{ variables: { colorPrimary: "#06b6d4", borderRadius: "0.75rem" } }}>
            <ClerkAuthBridge>{shell}</ClerkAuthBridge>
          </ClerkProvider>
        ) : (
          <NoAuthBridge>{shell}</NoAuthBridge>
        )}
      </body>
    </html>
  );
}
