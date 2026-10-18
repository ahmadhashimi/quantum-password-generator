import { Gauge } from "lucide-react";
import type { Metadata } from "next";

import { Unavailable } from "@/components/dashboard/Notices";
import { UsageView } from "@/components/dashboard/UsageView";
import { load } from "@/components/dashboard/load";
import { PageHeader } from "@/components/ui";
import { MeUsage } from "@/lib/api/schemas";

export const metadata: Metadata = { title: "Usage and limits" };

export default async function UsagePage() {
  const usage = await load("/api/v2/me/usage", MeUsage);
  return (
    <>
      <PageHeader eyebrow="Usage" icon={<Gauge aria-hidden />} title="Usage and limits"
                  description="What your account has used today and this month (UTC), against the caps that apply to it." />
      {usage.state === "ok" ? <UsageView usage={usage.data} /> : <Unavailable result={usage} what="your usage" />}
    </>
  );
}
