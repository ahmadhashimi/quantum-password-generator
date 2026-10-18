import { Atom, Users, Zap } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { apiGet } from "../lib/api";
import { useAppAuth } from "../lib/auth";
import type { AdminStats } from "../lib/types";

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="glass p-5">
      <Icon className="mb-3 size-5 text-cyan-500" aria-hidden />
      <p className="text-3xl font-semibold tabular-nums">{value}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

export function AdminDashboard() {
  const { getToken, signedIn } = useAppAuth();
  const { data, error } = useApi(() => apiGet<AdminStats>("/api/v2/admin/stats", undefined, getToken), [signedIn]);

  if (error) return <p className="glass p-6 text-rose-500">{error}</p>;
  if (!data) return <p className="p-6 text-slate-500">Loading…</p>;

  const max = Math.max(1, ...data.daily.map((d) => d.count));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Usage</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={Users} label="Users" value={data.users.toLocaleString()} />
        <Stat icon={Zap} label="Secrets generated" value={data.total_events.toLocaleString()} />
        <Stat icon={Atom} label="Quantum-sourced" value={`${Math.round(data.quantum_share * 100)}%`} />
      </div>

      <section className="glass p-6" aria-labelledby="daily-title">
        <h2 id="daily-title" className="mb-4 font-semibold">Last 30 days</h2>
        <div className="flex h-40 items-end gap-1">
          {data.daily.map((d) => (
            <div key={d.date} title={`${d.date}: ${d.count}`} className="flex-1 rounded-t bg-gradient-to-t from-cyan-500 to-violet-400"
              style={{ height: `${(d.count / max) * 100}%` }} />
          ))}
        </div>
      </section>

      <section className="glass overflow-x-auto p-6" aria-labelledby="users-title">
        <h2 id="users-title" className="mb-4 font-semibold">Recent users</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500">
            <tr><th className="py-2">Name</th><th>Email</th><th>Last seen</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-white/5">
            {data.recent_users.map((u) => (
              <tr key={u.id}>
                <td className="py-2">{u.name ?? "—"}</td>
                <td>{u.email ?? "—"}</td>
                <td>{new Date(u.last_seen).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
