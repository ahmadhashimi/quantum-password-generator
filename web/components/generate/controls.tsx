import { type ReactNode, useId } from "react";

import { cn } from "@/lib/cn";

export const SELECT_CLASS =
  "w-full rounded-md border border-border-strong bg-surface-raised px-3.5 py-2.5 text-sm text-fg outline-none " +
  "transition focus:border-accent focus:ring-2 focus:ring-ring/40 disabled:opacity-60";

/** A labelled range slider. The slider announces its own value, so the visible readout is not a live region. */
export function RangeField({ label, value, min, max, unit, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <label htmlFor={id} className="font-medium text-fg">{label}</label>
        <span aria-hidden className="font-mono text-accent">{value} {unit}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={1} value={value} aria-valuetext={`${value} ${unit}`}
             onChange={(e) => onChange(Number(e.target.value))} className="block w-full accent-accent" />
      <div aria-hidden className="flex justify-between font-mono text-xs text-subtle">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

/** A native radio group drawn as a segmented control: arrow keys and screen reader semantics come for free. */
export function Segmented<T extends string | number>({ legend, value, options, onChange, className }: {
  legend: string;
  value: T;
  options: { value: T; label: ReactNode; hint?: ReactNode }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const name = useId();
  return (
    <fieldset className={cn("min-w-0 space-y-2", className)}>
      <legend className="text-sm font-medium text-fg">{legend}</legend>
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => (
          <label key={String(o.value)} className="cursor-pointer">
            <input type="radio" name={name} className="peer sr-only" checked={o.value === value}
                   onChange={() => onChange(o.value)} />
            <span className="block rounded-md border border-border px-3 py-2 text-center text-sm font-medium text-muted
                             transition peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-fg
                             peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2
                             peer-focus-visible:outline-ring hover:text-fg">
              {o.label}
              {o.hint && <span className="mt-0.5 block text-xs font-normal text-subtle">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
