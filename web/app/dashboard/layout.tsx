import type { Metadata } from "next";
import type { ReactNode } from "react";

import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { Section } from "@/components/ui";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Section className="pb-20">
      <div className="pt-6">
        <DashboardNav />
      </div>
      {children}
    </Section>
  );
}
