"use client";

import { useId } from "react";

export function Toggle({ label, checked, onChange, disabled = false }: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3 rounded-md border
                                   border-border px-3 py-2 text-sm text-fg has-disabled:cursor-not-allowed
                                   has-disabled:opacity-60">
      <span>{label}</span>
      <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled}
             onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden className="relative h-5 w-9 shrink-0 rounded-full bg-border-strong transition
                                   after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full
                                   after:bg-white after:shadow after:transition peer-checked:bg-accent
                                   peer-checked:after:translate-x-4 peer-focus-visible:ring-2
                                   peer-focus-visible:ring-ring" />
    </label>
  );
}
