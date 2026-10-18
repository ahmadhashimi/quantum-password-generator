import { act, fireEvent, render, screen } from "@testing-library/react";

import { maskSecret } from "@/lib/format";

import { HISTORY_LIMIT, HistoryProvider, SessionHistory, useSessionHistory } from "./SessionHistory";

function Adder({ value, kind = "password" }: { value: string; kind?: "password" | "passphrase" | "random" }) {
  const { add } = useSessionHistory();
  return <button type="button" onClick={() => add({ kind, value, entropyBits: 120, quantum: true })}>add entry</button>;
}

function renderHistory(values: string[]) {
  return render(
    <HistoryProvider>
      {values.map((v) => <Adder key={v} value={v} />)}
      <SessionHistory />
    </HistoryProvider>,
  );
}

describe("SessionHistory", () => {
  afterEach(() => vi.restoreAllMocks());

  it("starts empty and masks every value", () => {
    renderHistory(["Zk4!hunter2Secret"]);
    expect(screen.getByText("Nothing generated yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "add entry" }));

    const shown = screen.getByTestId("history-value");
    expect(shown).toHaveTextContent(maskSecret("Zk4!hunter2Secret"));
    expect(document.body.textContent).not.toContain("Zk4!hunter2Secret");
    expect(screen.getByText(/Password · 120 bits · Quantum-seeded/)).toBeInTheDocument();
  });

  it("fully masks short values instead of showing their ends", () => {
    renderHistory(["Sh0rt!x8"]);
    fireEvent.click(screen.getByRole("button", { name: "add entry" }));
    expect(screen.getByTestId("history-value")).toHaveTextContent(/^•{8}$/);
    expect(document.body.textContent).not.toContain("Sh0");
  });

  it("keeps the newest ten, newest first", () => {
    const values = Array.from({ length: HISTORY_LIMIT + 2 }, (_, i) => `secret-value-${String(i).padStart(3, "0")}`);
    renderHistory(values);
    for (const b of screen.getAllByRole("button", { name: "add entry" })) fireEvent.click(b);

    const rows = screen.getAllByTestId("history-value");
    expect(rows).toHaveLength(HISTORY_LIMIT);
    expect(rows[0]).toHaveTextContent(maskSecret(values[values.length - 1] ?? ""));
  });

  it("clears the list", () => {
    renderHistory(["abcdefghij"]);
    fireEvent.click(screen.getByRole("button", { name: "add entry" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByTestId("history-value")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("copies the full value from memory and never touches web storage", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    renderHistory(["copy-me-please-0123"]);
    fireEvent.click(screen.getByRole("button", { name: "add entry" }));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Copy password from/ })));
    expect(writeText).toHaveBeenCalledWith("copy-me-please-0123");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("is a harmless no-op without a provider", () => {
    render(<><Adder value="orphan-value-123" /><SessionHistory /></>);
    fireEvent.click(screen.getByRole("button", { name: "add entry" }));
    expect(screen.getByText("Nothing generated yet.")).toBeInTheDocument();
  });
});
