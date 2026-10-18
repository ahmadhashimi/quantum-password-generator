import { fireEvent, render, screen } from "@testing-library/react";

import { StrengthChecker } from "./StrengthChecker";

describe("StrengthChecker", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders a private, non-autofilled input and says it runs locally", () => {
    render(<StrengthChecker />);
    const input = screen.getByLabelText("Password to check");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(screen.getByText(/Nothing you type is sent anywhere/)).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });

  it("toggles visibility", () => {
    render(<StrengthChecker />);
    const input = screen.getByLabelText("Password to check");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("scores a weak password locally, without any network request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<StrengthChecker />);
    fireEvent.change(screen.getByLabelText("Password to check"), { target: { value: "password123" } });

    const meter = await screen.findByRole("meter", { name: "Password strength" }, { timeout: 15_000 });
    expect(["Very weak", "Weak"]).toContain(meter.getAttribute("aria-valuetext"));
    expect(screen.getByRole("status")).toHaveTextContent(/estimated offline crack time/);
    expect(screen.getByText(/guarantee/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  }, 30_000);

  it("scores a long random-looking password as strong", async () => {
    render(<StrengthChecker />);
    fireEvent.change(screen.getByLabelText("Password to check"), { target: { value: "w*35gVK4v<R5CuxWG,O$q8Zt#" } });

    const meter = await screen.findByRole("meter", { name: "Password strength" }, { timeout: 15_000 });
    expect(["Strong", "Very strong"]).toContain(meter.getAttribute("aria-valuetext"));
  }, 30_000);

  it("hides the result again when the input is cleared", async () => {
    render(<StrengthChecker />);
    const input = screen.getByLabelText("Password to check");
    fireEvent.change(input, { target: { value: "letmein" } });
    await screen.findByRole("meter", {}, { timeout: 15_000 });
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  }, 30_000);
});
