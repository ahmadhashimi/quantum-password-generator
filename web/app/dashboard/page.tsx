"use client";
import { useApi } from "../../hooks/useApi";
import { apiGet } from "../../lib/api";
import { useAppAuth } from "../../lib/auth";
import type { Me } from "../../lib/types";
export default function Dashboard() {
  const { signedIn, getToken } = useAppAuth();
  const { data, error } = useApi(() => signedIn
    ? apiGet<Me>("/api/v2/me", undefined, getToken) : Promise.resolve(null), [signedIn]);
  return <section className="mx-auto max-w-2xl space-y-4">
    <h1 className="text-3xl font-bold">Account overview</h1>
    {error && <p role="alert">{error}</p>}
    {!signedIn ? <p>Sign in to see your usage.</p> :
      data ? <pre className="glass overflow-x-auto p-6 text-sm">{JSON.stringify(data.stats, null, 2)}</pre>
      : <p>Loading usage metadata…</p>}
  </section>;
}
