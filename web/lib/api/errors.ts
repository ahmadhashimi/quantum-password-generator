export class ApiError extends Error {
  override name = "ApiError";
  constructor(message: string, readonly status: number, readonly requestId: string | null,
              /** Machine-readable state from the body, e.g. "seeded" | "needs_investigation" on a 409 draw run. */
              readonly hint: string | null = null) {
    super(message);
  }
}

/** A readable message from a FastAPI error body ({detail: string | [{msg}]}). */
export async function errorFrom(res: Response): Promise<ApiError> {
  const requestId = res.headers.get("x-request-id");
  if (res.status === 429) return new ApiError("Too many requests. Wait a moment and try again.", 429, requestId);
  let message = `Request failed (${res.status})`;
  let hint: string | null = null;
  try {
    const body: unknown = await res.json();
    const status = (body as { status?: unknown }).status;
    if (typeof status === "string") hint = status;
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") message = detail;
    else if (Array.isArray(detail) && typeof (detail[0] as { msg?: unknown })?.msg === "string") {
      message = (detail[0] as { msg: string }).msg;
    }
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(message, res.status, requestId, hint);
}
