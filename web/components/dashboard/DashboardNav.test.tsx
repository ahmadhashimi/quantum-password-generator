import { render, screen, within } from "@testing-library/react";

import { DashboardNav } from "./DashboardNav";

const nav = vi.hoisted(() => ({ path: "/dashboard" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));

const current = (): string[] =>
  screen.getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page").map((l) => l.textContent ?? "");

describe("DashboardNav", () => {
  it("labels the navigation and links the three account pages", () => {
    render(<DashboardNav />);

    const links = within(screen.getByRole("navigation", { name: "Account" })).getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Overview", "/dashboard"],
      ["Receipts", "/dashboard/receipts"],
      ["Usage", "/dashboard/usage"],
    ]);
  });

  it.each([
    ["/dashboard", "Overview"],
    ["/dashboard/receipts", "Receipts"],
    ["/dashboard/usage", "Usage"],
  ])("marks only the current page on %s", (path, label) => {
    nav.path = path;
    render(<DashboardNav />);
    expect(current()).toEqual([label]);
  });
});
