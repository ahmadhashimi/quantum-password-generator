import { crackTime, maskSecret, sourceLabel, strengthFromBits, timeAgo } from "./format";

describe("format", () => {
  it("labels sources and never calls the simulator quantum", () => {
    expect(sourceLabel("ibm_simulator")).toMatch(/not quantum/);
    expect(sourceLabel("mystery")).toBe("mystery");
  });
  it("buckets strength", () => {
    expect([40, 60, 100, 130].map(strengthFromBits)).toEqual(["weak", "fair", "strong", "excellent"]);
  });
  it("estimates crack time", () => {
    expect(crackTime(10)).toBe("instantly");
    expect(crackTime(128)).toMatch(/^10\^\d+ years$/);
  });
  it("masks secrets", () => {
    expect(maskSecret("abc")).toBe("•••");
    expect(maskSecret("abcdefghij")).toBe("••••••••••");
    expect(maskSecret("abcdefghijklmnopqrst")).toBe("ab••••••••st");
  });
  it("relative time", () => {
    expect(timeAgo(null)).toBe("never");
    expect(timeAgo(1000, 1030)).toBe("just now");
    expect(timeAgo(1000, 1000 + 7200)).toBe("2 h ago");
  });
});
