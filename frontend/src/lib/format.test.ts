import { crackTime, sourceLabel, strengthFromBits } from "./format";

describe("format", () => {
  it("labels sources honestly", () => {
    expect(sourceLabel("ibm_quantum")).toBe("IBM Quantum");
    expect(sourceLabel("ibm_simulator")).toBe("IBM simulator");
  });

  it("buckets strength by entropy", () => {
    expect(strengthFromBits(40)).toBe("weak");
    expect(strengthFromBits(70)).toBe("fair");
    expect(strengthFromBits(100)).toBe("strong");
    expect(strengthFromBits(130)).toBe("excellent");
  });

  it("estimates crack time", () => {
    expect(crackTime(10)).toBe("instantly");
    expect(crackTime(128)).toMatch(/^10\^\d+ years$/);
  });
});
