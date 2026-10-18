import Link, { type LinkProps } from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition select-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
  "disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white shadow-card hover:brightness-110 active:brightness-95",
  secondary: "border border-border-strong bg-surface-raised text-fg hover:bg-bg-subtle",
  ghost: "text-muted hover:bg-bg-subtle hover:text-fg",
  danger: "bg-danger text-white hover:brightness-110",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
  icon: "size-9 p-0",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

type ButtonLinkProps<R extends string> = LinkProps<R> & {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

/** A link styled as a button. Prefetch is off by default: pages behind it may hold account data. */
export function ButtonLink<R extends string>({ variant = "primary", size = "md", className, prefetch = false,
                                              ...props }: ButtonLinkProps<R>) {
  return <Link prefetch={prefetch} className={buttonClass(variant, size, className)} {...props} />;
}
