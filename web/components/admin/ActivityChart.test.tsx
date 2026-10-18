import { render, screen, within } from "@testing-library/react";

import { ActivityChart, fillDays } from "./ActivityChart";

describe("fillDays", () => {
  it("fills quiet days with zero and ends on today", () => {
    const days = fillDays([{ date: "2026-10-16", count: 5 }, { date: "2026-10-18", count: 2 }], 5, "2026-10-18");
    expect(days.map((d) => d.date)).toEqual(["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
    expect(days.map((d) => d.count)).toEqual([0, 0, 5, 0, 2]);
  });

  it("ends at the newest returned day when it is later than the supplied today", () => {
    const days = fillDays([{ date: "2026-10-19", count: 1 }], 2, "2026-10-18");
    expect(days.map((d) => d.date)).toEqual(["2026-10-18", "2026-10-19"]);
  });

  it("crosses month and year boundaries in UTC", () => {
    const days = fillDays([], 3, "2027-01-01");
    expect(days.map((d) => d.date)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
  });
});

describe("ActivityChart", () => {
  it("renders the same numbers in a visually hidden table and summarises them", () => {
    render(<ActivityChart days={30} today="2026-10-18" daily={[{ date: "2026-10-17", count: 3 }, { date: "2026-10-18", count: 9 }]} />);

    const table = screen.getByRole("table", { name: /Usage events per day, UTC, last 30 days/ });
    expect(within(table).getAllByRole("row")).toHaveLength(31);
    expect(within(table).getByRole("row", { name: "2026-10-18 9" })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: "2026-10-17 3" })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: "2026-10-01 0" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /12 usage events in the last 30 days\. Busiest day Oct 18 with 9/ })).toBeInTheDocument();
  });

  it("says so when there is no activity", () => {
    render(<ActivityChart days={30} today="2026-10-18" daily={[]} />);
    expect(screen.getByRole("img", { name: "No usage events in the last 30 days." })).toBeInTheDocument();
  });
});
