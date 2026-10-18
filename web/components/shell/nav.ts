export const PRIMARY_NAV = [
  { href: "/generate", label: "Generate" },
  { href: "/verify", label: "Verify" },
  { href: "/draws", label: "Draws" },
  { href: "/developers", label: "Developers" },
  { href: "/transparency", label: "Transparency" },
  { href: "/pricing", label: "Pricing" },
] as const;

export const FOOTER_NAV = [
  {
    title: "Product",
    links: [
      { href: "/generate", label: "Generate" },
      { href: "/draws", label: "Verifiable draws" },
      { href: "/verify", label: "Proof Explorer" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Trust",
    links: [
      { href: "/transparency", label: "Transparency" },
      { href: "/status", label: "Source status" },
      { href: "/developers", label: "Evidence API" },
      { href: "/enterprise", label: "Enterprise" },
    ],
  },
] as const;
