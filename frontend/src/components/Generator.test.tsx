import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Generator } from "./Generator";

const provenance = { sources: ["lfd"], quantum: true, quantum_bytes: 64, mixed_with: "os_csprng", failures: {}, timestamp: 0 };

describe("Generator", () => {
  afterEach(() => vi.restoreAllMocks());

  it("generates a password and shows provenance + entropy", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ password: "Qu4ntum!Secret#42", length: 17, entropy_bits: 108.2, provenance })),
    );
    const onGenerated = vi.fn();
    render(<Generator onGenerated={onGenerated} />);

    await userEvent.click(screen.getByRole("button", { name: "Generate" }));

    expect(await screen.findByText("Qu4ntum!Secret#42")).toBeInTheDocument();
    expect(screen.getByText(/Quantum · LfD QRNG/)).toBeInTheDocument();
    expect(screen.getByText(/108.2 bits of entropy/)).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/v2/password?length=20");
    expect(onGenerated).toHaveBeenCalledWith(expect.objectContaining({ value: "Qu4ntum!Secret#42" }));
  });

  it("flags classical fallback results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ password: "x".repeat(20), length: 20, entropy_bits: 120, provenance: {
        ...provenance, sources: ["os_csprng"], quantum: false } })),
    );
    render(<Generator onGenerated={() => undefined} />);
    await userEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(await screen.findByText(/Not quantum/)).toBeInTheDocument();
  });

  it("disables generate when no character set is selected", async () => {
    render(<Generator onGenerated={() => undefined} />);
    for (const label of ["A–Z", "a–z", "0–9", "!@#$"]) await userEvent.click(screen.getByText(label));
    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
  });
});
