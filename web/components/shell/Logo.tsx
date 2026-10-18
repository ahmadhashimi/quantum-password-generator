export function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="qp-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="none" stroke="url(#qp-g)" strokeWidth="2" />
      <ellipse cx="16" cy="16" rx="10" ry="4.2" fill="none" stroke="url(#qp-g)" strokeWidth="1.6" />
      <ellipse cx="16" cy="16" rx="10" ry="4.2" fill="none" stroke="url(#qp-g)" strokeWidth="1.6"
               transform="rotate(60 16 16)" />
      <ellipse cx="16" cy="16" rx="10" ry="4.2" fill="none" stroke="url(#qp-g)" strokeWidth="1.6"
               transform="rotate(-60 16 16)" />
      <circle cx="16" cy="16" r="2.2" fill="url(#qp-g)" />
    </svg>
  );
}
