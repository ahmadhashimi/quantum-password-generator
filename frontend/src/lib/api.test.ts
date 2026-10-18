import { parseSSE } from "./api";

function streamOf(...chunks: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      chunks.forEach((ch) => c.enqueue(enc.encode(ch)));
      c.close();
    },
  });
}

describe("parseSSE", () => {
  it("parses events split across chunks", async () => {
    const body = streamOf('event: conversation\ndata: {"id":"c1"}\n\nevent: te', 'xt\ndata: {"text":"hi"}\n\n');
    const events = [];
    for await (const ev of parseSSE(body)) events.push(ev);
    expect(events).toEqual([
      { event: "conversation", data: { id: "c1" } },
      { event: "text", data: { text: "hi" } },
    ]);
  });
});
