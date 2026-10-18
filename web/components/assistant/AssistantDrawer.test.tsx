import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AssistantDrawer } from "./AssistantDrawer";

const SECRET = "Hq4-Tr9-Lm2-Xz7-Pw5";
const PROVENANCE = { sources: ["lfd"], quantum: true, quantum_bytes: 64, mixed_with: "os_csprng", failures: {} };

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

function streamOf(...frames: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(encoder.encode(f));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const FULL_CHAT = [
  sse("conversation", { id: "conv-1" }),
  sse("tool", { name: "generate_password" }),
  sse("secret", { secret_id: "s1", kind: "password", value: SECRET, entropy_bits: 118.4, provenance: PROVENANCE }),
  sse("text", { text: "Here is a 19-character password." }),
  sse("done", {}),
];

const spyFetch = (impl: typeof fetch) => vi.spyOn(globalThis, "fetch").mockImplementation(impl);
const requests = (m: ReturnType<typeof spyFetch>) =>
  m.mock.calls.map(([input, init]) => ({ url: String(input), init: init ?? {} }));

function send(text: string) {
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
}

describe("AssistantDrawer", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is a modal dialog that focuses the message input and closes on Escape", () => {
    const onClose = vi.fn();
    render(<AssistantDrawer open onClose={onClose} needsSignIn={false} />);
    const dialog = screen.getByRole("dialog", { name: "Security assistant" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByLabelText("Message")).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close assistant" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("renders nothing while closed", () => {
    render(<AssistantDrawer open={false} onClose={() => undefined} needsSignIn={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a sign-in prompt instead of the chat when sign-in is needed", () => {
    const onClose = vi.fn();
    render(<AssistantDrawer open onClose={onClose} needsSignIn />);
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link).toHaveAttribute("href", "/sign-in");
    expect(screen.getByLabelText("Message")).toBeDisabled();
    fireEvent.click(link);
    expect(onClose).toHaveBeenCalled();
  });

  it("streams text, tool chips and secrets; secrets render only through SecretDisplay", async () => {
    const fetchMock = spyFetch(async () => streamOf(...FULL_CHAT));
    render(<AssistantDrawer open onClose={() => undefined} needsSignIn={false} />);
    send("Make me a strong password");

    expect(await screen.findByText("Here is a 19-character password.")).toBeInTheDocument();
    expect(screen.getByText("Make me a strong password")).toBeInTheDocument();
    expect(screen.getByText("Generating a password")).toBeInTheDocument();
    expect(screen.getByTestId("secret")).toHaveTextContent(SECRET);
    expect(screen.getByText(/Quantum-seeded · LfD QRNG/)).toBeInTheDocument();
    expect(screen.getByText(/118\.4 bits/)).toBeInTheDocument();
    expect(screen.getByText(/The assistant never sees this value/)).toBeInTheDocument();
    expect(document.body.innerHTML.split(SECRET)).toHaveLength(2);

    const [req] = requests(fetchMock);
    expect(req?.url).toBe("/api/v2/assistant/chat");
    expect(req?.init).toMatchObject({ method: "POST", cache: "no-store", credentials: "same-origin" });
    expect(JSON.parse(String(req?.init.body))).toEqual({ message: "Make me a strong password", conversation_id: null });

    // Our own announcement regions never carry the secret (SecretDisplay's <output> is not one of them).
    const announcements = [...document.querySelectorAll('[role="status"]')].map((n) => n.textContent).join(" ");
    expect(announcements).toContain("The assistant replied.");
    expect(announcements).not.toContain(SECRET);
  });

  it("continues the conversation by id, and Reset clears it and deletes it server-side", async () => {
    const fetchMock = spyFetch(async (input, init) =>
      init?.method === "DELETE" ? new Response('{"ok":true}', { status: 200 }) : streamOf(...FULL_CHAT));
    render(<AssistantDrawer open onClose={() => undefined} needsSignIn={false} />);
    send("first");
    await screen.findByText("Here is a 19-character password.");
    send("second");
    await waitFor(() => expect(requests(fetchMock).filter((r) => r.init.method === "POST")).toHaveLength(2));
    expect(JSON.parse(String(requests(fetchMock)[1]?.init.body))).toEqual({ message: "second", conversation_id: "conv-1" });
    await screen.findAllByTestId("secret");

    fireEvent.click(screen.getByRole("button", { name: /Reset/ }));
    expect(screen.queryByTestId("secret")).not.toBeInTheDocument();
    expect(screen.queryByText("first")).not.toBeInTheDocument();
    await waitFor(() => expect(requests(fetchMock).some((r) => r.init.method === "DELETE")).toBe(true));
    const del = requests(fetchMock).find((r) => r.init.method === "DELETE");
    expect(del?.url).toBe("/api/v2/assistant/conversations/conv-1");
    expect(del?.init).toMatchObject({ cache: "no-store" });
    expect(screen.getByLabelText("Message")).toHaveFocus();
  });

  it("ignores a failing DELETE on Reset", async () => {
    spyFetch(async (_input, init) =>
      init?.method === "DELETE" ? Promise.reject(new TypeError("offline")) : streamOf(...FULL_CHAT));
    render(<AssistantDrawer open onClose={() => undefined} needsSignIn={false} />);
    send("hello");
    await screen.findByText("Here is a 19-character password.");
    fireEvent.click(screen.getByRole("button", { name: /Reset/ }));
    expect(screen.queryByText("hello")).not.toBeInTheDocument();
  });

  it("Stop aborts the request and returns to the Send button", async () => {
    let signal: AbortSignal | null | undefined;
    spyFetch((_input, init) => {
      signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });
    render(<AssistantDrawer open onClose={() => undefined} needsSignIn={false} />);
    send("slow one");

    const stop = await screen.findByRole("button", { name: /Stop/ });
    await act(async () => fireEvent.click(stop));
    expect(signal?.aborted).toBe(true);
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
    expect(screen.getByText("Stopped.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows error events and request failures as alerts", async () => {
    spyFetch(async () =>
      streamOf(sse("conversation", { id: "c" }), sse("error", { message: "Assistant unavailable (Timeout)." }),
               sse("done", {})));
    render(<AssistantDrawer open onClose={() => undefined} needsSignIn={false} />);
    send("hi");
    expect(await screen.findByRole("alert")).toHaveTextContent("Assistant unavailable (Timeout).");
  });

  it("shows the API message when the chat request is rejected", async () => {
    spyFetch(
      async () => new Response('{"detail":"Daily assistant limit reached"}', { status: 429 }),
    );
    render(<AssistantDrawer open onClose={() => undefined} needsSignIn={false} />);
    send("hi");
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests");
  });

  it("offers suggestions that start a conversation", async () => {
    const fetchMock = spyFetch(async () => streamOf(...FULL_CHAT));
    render(<AssistantDrawer open onClose={() => undefined} needsSignIn={false} />);
    fireEvent.click(screen.getByRole("button", { name: "I need a memorable Wi-Fi passphrase" }));
    await screen.findByText("Here is a 19-character password.");
    expect(JSON.parse(String(requests(fetchMock)[0]?.init.body)).message).toBe("I need a memorable Wi-Fi passphrase");
  });

  it("wraps Tab focus inside the dialog", () => {
    render(<AssistantDrawer open onClose={() => undefined} needsSignIn={false} />);
    const close = screen.getByRole("button", { name: "Close assistant" });
    const suggestion = screen.getByRole("button", { name: "Are the quantum sources online right now?" });
    suggestion.focus();
    // Message input and its disabled Send button sit after the suggestions; Send is disabled, so the input is last.
    screen.getByLabelText("Message").focus();
    fireEvent.keyDown(screen.getByLabelText("Message"), { key: "Tab" });
    expect(close).toHaveFocus();
  });
});
