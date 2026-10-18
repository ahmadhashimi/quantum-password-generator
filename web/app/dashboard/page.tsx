import { UserRound } from "lucide-react";
import type { Metadata } from "next";

import { OverviewView } from "@/components/dashboard/OverviewView";
import { Unavailable } from "@/components/dashboard/Notices";
import { load } from "@/components/dashboard/load";
import { PageHeader } from "@/components/ui";
import { Me } from "@/lib/api/schemas";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const me = await load("/api/v2/me", Me);
  if (me.state !== "ok") {
    return (
      <>
        <PageHeader eyebrow="Account" icon={<UserRound aria-hidden />} title="Your dashboard" />
        <Unavailable result={me} what="your account" />
      </>
    );
  }
  const who = me.data.name?.trim() || me.data.email || null;
  return (
    <>
      <PageHeader eyebrow="Account" icon={<UserRound aria-hidden />} title={who ? `Welcome back, ${who}` : "Welcome back"}
                  description="What you have issued, your limits, and the receipts behind them." />
      <OverviewView me={me.data} />
    </>
  );
}
