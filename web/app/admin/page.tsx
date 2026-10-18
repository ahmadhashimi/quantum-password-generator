import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { AdminOverview } from "@/components/admin/AdminOverview";
import { AuditLog } from "@/components/admin/AuditLog";
import { Investigations } from "@/components/admin/Investigations";
import { Unavailable } from "@/components/dashboard/Notices";
import { load } from "@/components/dashboard/load";
import { ButtonLink, Callout, PageHeader, Section } from "@/components/ui";
import { AdminStats } from "@/lib/api/schemas";

export const metadata: Metadata = { title: "Operations", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const stats = await load("/api/v2/admin/stats", AdminStats);
  return (
    <Section className="pb-20">
      <PageHeader eyebrow="Operator" icon={<ShieldCheck aria-hidden />} title="Operations"
                  description="Usage, entropy source detail, the audit log and interrupted draws. Everything here is operated by this server."
                  actions={<ButtonLink href="/dashboard" variant="secondary">Your dashboard</ButtonLink>} />
      {stats.state === "ok" ? (
        <div className="space-y-12">
          <AdminOverview stats={stats.data} />
          <div className="space-y-8">
            <AuditLog />
            <Investigations />
          </div>
          <Callout tone="neutral" title="What this page can and cannot show">
            <p>
              Sources, IBM jobs and health results are operator-asserted provenance. Independent quantum evidence is not
              available, because IBM does not sign job results. The audit log and the receipt log are server-operated,
              not externally anchored, so an operator could withhold results.
            </p>
          </Callout>
        </div>
      ) : (
        <Unavailable result={stats} what="the operations page" admin />
      )}
    </Section>
  );
}
