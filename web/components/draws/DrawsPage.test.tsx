// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/client", () => ({
  useAppAuth: () => ({ enabled: false, loaded: true, signedIn: false, getToken: async () => null }),
}));

import DrawsPage from "@/app/draws/page";

describe("/draws page shell", () => {
  it("server-renders without a browser, with the three steps and the limits", () => {
    const html = renderToString(<DrawsPage />);
    expect(html).toContain("Provably fair draws");
    for (const step of ["Commit", "Run", "Verify"]) expect(html).toContain(step);
    expect(html).toContain("The operator can still choose when to run a draw or withhold a result");
    expect(html).toContain("Not for regulated gambling or lotteries.");
    expect(html).toContain("a dishonest operator could try several draws privately and publish only one");
  });

  it("renders the empty form with submit disabled and nothing prefilled", () => {
    const html = renderToString(<DrawsPage />);
    expect(html).toContain("1. Commit your entries");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^]*Commit entries/);
  });

  it("does not claim certification or quantum-safety", () => {
    const html = renderToString(<DrawsPage />).toLowerCase();
    for (const banned of ["certified", "unhackable", "quantum-safe", "proves quantum origin", "never weaker"]) {
      expect(html).not.toContain(banned);
    }
  });
});
