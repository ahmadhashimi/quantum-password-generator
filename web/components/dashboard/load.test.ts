import { z } from "zod";

import { ApiError } from "@/lib/api/errors";
import { serverApiOrNull } from "@/lib/api/server";

import { load } from "./load";

vi.mock("@/lib/api/server", () => ({ serverApiOrNull: vi.fn() }));

const fetchOnce = vi.mocked(serverApiOrNull);
const Shape = z.object({ id: z.string() });

describe("load", () => {
  afterEach(() => fetchOnce.mockReset());

  it("returns the parsed data", async () => {
    fetchOnce.mockResolvedValue({ data: { id: "u1" }, status: 200 });
    await expect(load("/api/v2/me", Shape)).resolves.toEqual({ state: "ok", data: { id: "u1" } });
    expect(fetchOnce).toHaveBeenCalledWith("/api/v2/me", Shape);
  });

  it.each([401, 403, 404] as const)("turns a %i into a denied state", async (status) => {
    fetchOnce.mockResolvedValue({ data: null, status });
    await expect(load("/api/v2/me", Shape)).resolves.toEqual({ state: "denied", status });
  });

  it("turns an API failure into a failed state that keeps the request id", async () => {
    fetchOnce.mockRejectedValue(new ApiError("Database is busy", 503, "req-9"));
    await expect(load("/api/v2/me", Shape)).resolves.toEqual({
      state: "failed", message: "Database is busy", requestId: "req-9",
    });
  });

  it("explains an unreachable API", async () => {
    fetchOnce.mockRejectedValue(new TypeError("fetch failed"));
    await expect(load("/api/v2/me", Shape)).resolves.toEqual({
      state: "failed", message: "The API could not be reached.", requestId: null,
    });
  });

  it("rethrows anything else untouched, so framework control flow and bugs are not swallowed", async () => {
    const control = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/sign-in" });
    fetchOnce.mockRejectedValue(control);
    await expect(load("/api/v2/me", Shape)).rejects.toBe(control);
  });
});
