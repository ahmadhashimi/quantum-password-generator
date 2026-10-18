/** Clerk is optional: without a publishable key the app runs in local mode against a development backend. */
export const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
export const clerkEnabled = /^pk_(test|live)_[A-Za-z0-9+/=_-]+$/.test(clerkPublishableKey);

/** The Clerk Frontend API host encoded in a publishable key (base64 of "host$"). */
export function clerkFrontendApi(key: string = clerkPublishableKey): string | null {
  const encoded = key.split("_")[2];
  if (!encoded) return null;
  try {
    const host = atob(encoded).replace(/\$$/, "");
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? host : null;
  } catch {
    return null;
  }
}
