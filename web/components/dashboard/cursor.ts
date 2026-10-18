// An offset is optional so a timestamp the API returned without one still pages; the length bound keeps junk short.
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]{1,32}(?:Z|[+-]\d{2}:\d{2})?$/;

/** `before` is a created_at cursor echoed back from the API; anything that isn't a timestamp is ignored. */
export function cursorOf(value: string | string[] | undefined): string | null {
  return typeof value === "string" && TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
}
