import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "warning" | "danger" | "neutral";

const styles: Record<Tone, { box: string; icon: ReactNode }> = {
  info: { box: "border-info/30 bg-info-soft", icon: <Info className="text-info" /> },
  success: { box: "border-success/30 bg-success-soft", icon: <CheckCircle2 className="text-success" /> },
  warning: { box: "border-warning/30 bg-warning-soft", icon: <AlertTriangle className="text-warning" /> },
  danger: { box: "border-danger/30 bg-danger-soft", icon: <ShieldAlert className="text-danger" /> },
  neutral: { box: "border-dashed border-border-strong bg-surface-sunken", icon: <Info className="text-subtle" /> },
};

export function Callout({ tone = "info", title, children, className, role }: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  const s = styles[tone];
  return (
    <div role={role} className={cn("flex gap-3 rounded-lg border p-4 text-sm", s.box, className)}>
      <span aria-hidden className="mt-0.5 shrink-0 [&>svg]:size-4">{s.icon}</span>
      <div className="min-w-0 space-y-1">
        {title && <p className="font-medium text-fg">{title}</p>}
        {children && <div className="text-muted">{children}</div>}
      </div>
    </div>
  );
}
