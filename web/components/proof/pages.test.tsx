import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import VerifyPage, { metadata as verifyMetadata } from "@/app/verify/page";
import ProofPage, { metadata as proofMetadata } from "@/app/verify/[id]/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("/verify", () => {
  it("offers both entry points and keeps the three verdicts apart", () => {
    render(<VerifyPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Verify a receipt in your browser" })).toBeInTheDocument();
    expect(screen.getByLabelText("Receipt ID")).toBeInTheDocument();
    expect(screen.getByLabelText("Receipt, draw response or evidence export (JSON)")).toBeInTheDocument();
    expect(screen.getByText("Cryptographic")).toBeInTheDocument();
    expect(screen.getByText("Operator-asserted")).toBeInTheDocument();
    expect(screen.getByText("None available")).toBeInTheDocument();
    expect(screen.getByText(/not that a quantum device independently attested the entropy/)).toBeInTheDocument();
    expect(verifyMetadata.title).toBe("Proof Explorer");
  });
});

describe("/verify/[id]", () => {
  it("is not indexed", () => {
    expect(proofMetadata).toMatchObject({ title: "Proof Explorer", robots: { index: false, follow: false } });
  });

  it.each(["short", "has space 16chars", "../../../etc/pass", "<script>alert(1)<", "ABCDEFGHIJKLMNOPQ"])(
    "returns not-found for the malformed ID %j", async (id) => {
      await expect(ProofPage({ params: Promise.resolve({ id }) })).rejects.toThrow("404");
    });

  it("renders the explorer for a well-formed ID, which starts verifying immediately", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>(() => undefined));
    render(await ProofPage({ params: Promise.resolve({ id: "3JGdISaLMR84RtF1" }) }));
    expect(screen.getByRole("heading", { level: 1, name: "Check this receipt yourself" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Verify another" })).toHaveAttribute("href", "/verify");
    expect(screen.getByText("Verifying the receipt in your browser…")).toBeInTheDocument();
  });
});
