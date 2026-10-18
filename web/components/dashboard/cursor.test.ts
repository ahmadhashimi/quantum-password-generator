import { cursorOf } from "./cursor";
import { formatIso } from "./format";

describe("cursorOf", () => {
  it.each([
    "2026-10-18T06:28:58.887244+00:00",
    "2026-10-18T06:28:58Z",
    "2026-10-18T06:28:58.887244",
  ])("accepts the timestamp %s the API hands out", (value) => {
    expect(cursorOf(value)).toBe(value);
  });

  it.each([
    undefined,
    ["2026-10-18T06:28:58Z", "2026-10-17T06:28:58Z"],
    "",
    "yesterday",
    "2026-13-45T06:28:58+00:00",
    "2026-10-18T06:28:58Z&limit=500",
    "2026-10-18T06:28:58Z\n",
    `2026-10-18T${"1".repeat(40)}Z`,
    "'; drop table receipts; --",
  ])("ignores %j so a hand-edited URL cannot reach the API", (value) => {
    expect(cursorOf(value)).toBeNull();
  });
});

describe("formatIso", () => {
  it("renders UTC with a zone label", () => {
    expect(formatIso("2026-10-18T06:28:58.887244+00:00")).toBe("2026-10-18 06:28:58 UTC");
    expect(formatIso("2026-10-18T08:28:58+02:00")).toBe("2026-10-18 06:28:58 UTC");
  });

  it("reads a timestamp without a zone as UTC, not as the viewer's local time", () => {
    expect(formatIso("2026-10-18T06:28:58.887244")).toBe("2026-10-18 06:28:58 UTC");
  });

  it("returns what it cannot parse unchanged", () => {
    expect(formatIso("not a date")).toBe("not a date");
  });
});
