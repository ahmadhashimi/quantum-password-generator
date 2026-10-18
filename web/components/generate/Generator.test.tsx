import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { downloadText } from "@/lib/download";
import { maskSecret } from "@/lib/format";

import { Generator } from "./Generator";
import { HistoryProvider, SessionHistory } from "./SessionHistory";

vi.mock("@/lib/download", () => ({ downloadText: vi.fn(), downloadJson: vi.fn() }));

const SECRET = "Qx7!mZ2#kP9$vL48wN8@";
const QUANTUM = { sources: ["lfd"], quantum: true, quantum_bytes: 64, mixed_with: "os_csprng", failures: {},
                  health: { sp800_90b_style: "pass" }, timestamp: 1 };
const OS_ONLY = { sources: ["os_csprng"], quantum: false, quantum_bytes: 0, mixed_with: "os_csprng",
                  failures: { lfd: "unavailable" }, health: { sp800_90b_style: "n/a" }, timestamp: 1 };

// Python-style receipt text: 128.0 must survive byte-for-byte (JSON.parse would turn it into 128).
const RECEIPT = '{"payload":{"version":"qpg-receipt/2","receipt_id":"3JGdISaLMR84RtF1","issued_at":1792304938,' +
  '"kind":"random","key_id":"9d4cc626d6b265c6","provenance":{"sources":["lfd"],"quantum":true,"quantum_bytes":64,' +
  '"mixed_with":"os_csprng"},"entropy_bits":128.0,"commitment":"ab12","result":null,"details":{"bytes":16}},' +
  '"signatures":{"ed25519":"AAAA"}}';

const passwordBody = (provenance: object = QUANTUM) =>
  JSON.stringify({ password: SECRET, length: 24, entropy_bits: 150.5, provenance });

function mockFetch(body: string, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response(body, { status, headers: { "content-type": "application/json" } }),
  );
}

type FetchMock = ReturnType<typeof mockFetch>;
const requests = (m: FetchMock) => m.mock.calls.map(([input, init]) => ({ url: String(input), init: init ?? {} }));
const query = (url: string) => new URL(url, "http://localhost").searchParams;

const generate = (name = "Generate password") => fireEvent.click(screen.getByRole("button", { name }));

describe("Generator", () => {
  afterEach(() => vi.restoreAllMocks());

  it("fetches with no-store and never puts the secret in the URL or a request body", async () => {
    const fetchMock = mockFetch(passwordBody());
    render(<Generator />);
    generate();

    expect(await screen.findByText(SECRET)).toBeInTheDocument();
    const [req] = requests(fetchMock);
    expect(req?.url.startsWith("/api/v2/password?")).toBe(true);
    expect(query(req?.url ?? "").get("length")).toBe("24");
    expect(query(req?.url ?? "").get("receipt")).toBe("true");
    expect(req?.url).not.toContain(SECRET);
    expect(req?.init).toMatchObject({ method: "GET", cache: "no-store", credentials: "same-origin" });
    expect(req?.init.body).toBeUndefined();
    expect(screen.getByText(/Quantum-seeded · LfD QRNG/)).toBeInTheDocument();
    expect(screen.getByText(/150\.5 bits/)).toBeInTheDocument();
    expect(screen.queryByText(/Quantum sources unavailable/)).not.toBeInTheDocument();
  });

  it("warns that an OS CSPRNG-only result is not quantum", async () => {
    mockFetch(passwordBody(OS_ONLY));
    render(<Generator />);
    generate();

    expect(await screen.findByText(/Quantum sources unavailable: this result came from the OS CSPRNG only and is labelled not quantum/))
      .toBeInTheDocument();
    expect(screen.getByText(/Unavailable for this request: LfD QRNG/)).toBeInTheDocument();
    expect(screen.getByText(/Not quantum · OS CSPRNG/)).toBeInTheDocument();
  });

  it("warns when only some sources failed", async () => {
    mockFetch(passwordBody({ ...QUANTUM, failures: { anu: "unavailable" } }));
    render(<Generator />);
    generate();

    expect(await screen.findByText(/Some quantum sources were unavailable for this request/)).toBeInTheDocument();
    expect(screen.getByText(/Unavailable for this request: ANU QRNG/)).toBeInTheDocument();
  });

  it("shows the receipt and saves it from the exact received text, salt included", async () => {
    mockFetch(`{"hex":"00ff00ff00ff00ff00ff00ff00ff00ff","bytes":16,"provenance":${JSON.stringify(QUANTUM)},` +
      `"receipt":${RECEIPT},"receipt_salt":"c2FsdA"}`);
    render(<Generator />);
    fireEvent.click(screen.getByRole("tab", { name: "Random key" }));
    generate("Generate key");

    expect(await screen.findByText("Signed receipt")).toBeInTheDocument();
    expect(screen.getByText("3JGdISaLMR84RtF1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /verify/i })).toHaveAttribute("href", "/verify/3JGdISaLMR84RtF1");

    fireEvent.click(screen.getByRole("button", { name: /download/i }));
    expect(downloadText).toHaveBeenCalledTimes(1);
    const [filename, text] = vi.mocked(downloadText).mock.calls[0] ?? [];
    expect(filename).toBe("receipt-3JGdISaLMR84RtF1.json");
    expect(text).toContain('"entropy_bits": 128.0');
    expect(text).toContain('"salt": "c2FsdA"');
  });

  it("uses bytes x 8 as the entropy of a random key and requests the chosen size", async () => {
    const fetchMock = mockFetch(JSON.stringify({ hex: "ab".repeat(64), bytes: 64, provenance: QUANTUM }));
    render(<Generator />);
    fireEvent.click(screen.getByRole("tab", { name: "Random key" }));
    fireEvent.click(screen.getByRole("radio", { name: /64 bytes/ }));
    generate("Generate key");

    expect(await screen.findByText("ab".repeat(64))).toBeInTheDocument();
    expect(screen.getByText("512.0 bits")).toBeInTheDocument();
    const [req] = requests(fetchMock);
    expect(req?.url.startsWith("/api/v2/random?")).toBe(true);
    expect(query(req?.url ?? "").get("bytes")).toBe("64");
  });

  it("sends passphrase options, including a space separator, as query parameters", async () => {
    const fetchMock = mockFetch(JSON.stringify({ passphrase: "alpha beta gamma", words: 3, entropy_bits: 38.7,
                                                 provenance: QUANTUM }));
    render(<Generator />);
    fireEvent.click(screen.getByRole("tab", { name: "Passphrase" }));
    fireEvent.change(screen.getByLabelText("Separator"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("switch", { name: "Capitalize words" }));
    fireEvent.click(screen.getByRole("switch", { name: "Attach signed receipt" }));
    generate("Generate passphrase");

    expect(await screen.findByText("alpha beta gamma")).toBeInTheDocument();
    const params = query(requests(fetchMock)[0]?.url ?? "");
    expect(params.get("separator")).toBe(" ");
    expect(params.get("capitalize")).toBe("true");
    expect(params.get("receipt")).toBe("false");
    expect(screen.queryByText("Signed receipt")).not.toBeInTheDocument();
  });

  it("disables generate when no character set is selected", () => {
    render(<Generator />);
    for (const name of [/uppercase/i, /lowercase/i, /digits/i, /symbols/i]) {
      fireEvent.click(screen.getByRole("switch", { name }));
    }
    expect(screen.getByRole("button", { name: "Generate password" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Select at least one character set");
  });

  it("generates when Enter is pressed in a form control", async () => {
    const fetchMock = mockFetch(passwordBody());
    render(<Generator />);
    fireEvent.keyDown(screen.getByLabelText("Length"), { key: "Enter" });

    expect(await screen.findByText(SECRET)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows API errors in an alert and no stale secret", async () => {
    mockFetch(JSON.stringify({ detail: [{ msg: "Input should be less than or equal to 128" }] }), 422);
    render(<Generator />);
    generate();

    expect(await screen.findByRole("alert")).toHaveTextContent("Input should be less than or equal to 128");
    expect(screen.queryByTestId("secret")).toHaveTextContent("Press Generate to create a password");
  });

  it("clears the result when the secret type changes", async () => {
    mockFetch(passwordBody());
    render(<Generator />);
    generate();
    await screen.findByText(SECRET);

    fireEvent.click(screen.getByRole("tab", { name: "Passphrase" }));
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
    expect(screen.getByTestId("secret")).toHaveTextContent("Press Generate to create a passphrase");
  });

  it("records each result in the session history, masked, and renders the secret only once", async () => {
    mockFetch(passwordBody());
    render(<HistoryProvider><Generator /><SessionHistory /></HistoryProvider>);
    expect(screen.getByText("Nothing generated yet.")).toBeInTheDocument();
    generate();
    await screen.findByText(SECRET);

    await waitFor(() => expect(screen.getByTestId("history-value")).toHaveTextContent(maskSecret(SECRET)));
    expect(document.body.innerHTML.split(SECRET)).toHaveLength(2);
  });
});
