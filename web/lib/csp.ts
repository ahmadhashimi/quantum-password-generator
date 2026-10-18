/** Per-request Content-Security-Policy. Scripts need the nonce ('strict-dynamic' lets them load Clerk's bundle). */
export function buildCsp({ nonce, dev, clerkHost }: { nonce: string; dev: boolean; clerkHost: string | null }): string {
  const clerk = clerkHost ? [`https://${clerkHost}`] : [];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'self' and hosts are fallbacks for browsers without 'strict-dynamic' support (CSP2); modern browsers ignore them.
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...clerk, "https://challenges.cloudflare.com",
                   ...(dev ? ["'unsafe-eval'"] : [])],
    // Clerk's components and motion set inline styles at runtime; styles can't execute code.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https://img.clerk.com"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...clerk, "https://clerk-telemetry.com", "https://*.clerk-telemetry.com",
                    "https://*.protect.clerk.com"],
    "frame-src": ["'self'", "https://challenges.cloudflare.com", "https://*.protect.clerk.com"],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** Pages that can show secrets, receipts or account data: never cached by browsers or proxies. */
export const SENSITIVE_PATHS = /^\/(generate|verify|draws|dashboard|admin|sign-in|sign-up)(\/|$)/;
