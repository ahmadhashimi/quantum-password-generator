import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type Tone = "neutral" | "accent" | "violet" | "success" | "warning" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-bg-subtle text-muted ring-border",
  accent: "bg-accent-soft text-accent ring-accent/30",
  violet: "bg-accent-2-soft text-accent-2 ring-accent-2/30",
  success: "bg-success-soft text-success ring-success/30",
  warning: "bg-warning-soft text-warning ring-warning/30",
  danger: "bg-danger-soft text-danger ring-danger/30",
  info: "bg-info-soft text-info ring-info/30",
};

export function Badge({ tone = "neutral", icon, children, className, title }: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        "[&>svg]:size-3.5",
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

const dots: Record<Tone, string> = {
  neutral: "bg-subtle",
  accent: "bg-accent",
  violet: "bg-accent-2",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export function StatusDot({ tone, pulse = false, label }: { tone: Tone; pulse?: boolean; label?: string }) {
  return (
    <span className="relative inline-flex size-2.5" role={label ? "img" : undefined} aria-label={label}>
      {pulse && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", dots[tone])} />}
      <span className={cn("relative inline-flex size-2.5 rounded-full", dots[tone])} />
    </span>
  );
}
