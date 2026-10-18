// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import VerifyPage from "@/app/verify/page";
import ProofPage from "@/app/verify/[id]/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), notFound: vi.fn() }));

describe("server rendering (no browser globals)", () => {
  it("renders /verify with both forms and no receipt data", () => {
    expect(typeof window).toBe("undefined");
    const html = renderToString(<VerifyPage />);
    expect(html).toContain("Open a receipt by ID");
    expect(html).toContain("Verify a file in your browser");
    expect(html).not.toContain("Valid receipt");
  });

  it("renders /verify/[id] as a loading state, with nothing fetched on the server", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const html = renderToString(await ProofPage({ params: Promise.resolve({ id: "3JGdISaLMR84RtF1" }) }));
    expect(html).toContain("Check this receipt yourself");
    expect(html).toContain("Verifying the receipt in your browser");
    expect(html).not.toContain("Valid receipt");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
