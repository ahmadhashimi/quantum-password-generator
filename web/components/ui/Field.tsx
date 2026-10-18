import { type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes, useId } from "react";

import { cn } from "@/lib/cn";

const control =
  "w-full rounded-md border border-border-strong bg-surface-raised px-3.5 py-2.5 text-sm text-fg " +
  "placeholder:text-subtle outline-none transition focus:border-accent focus:ring-2 focus:ring-ring/40 " +
  "disabled:opacity-60 aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-24 resize-y", className)} {...props} />;
}

/** Label + control + hint/error, wired with ids for screen readers. */
export function Field({ label, hint, error, children, className }: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-fg">{label}</label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && <p id={hintId} className="text-xs text-subtle">{hint}</p>}
      {error && <p id={errorId} role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
