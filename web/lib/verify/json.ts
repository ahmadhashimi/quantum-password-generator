/**
 * Lossless JSON for signature verification.
 *
 * Receipts are signed over Python's canonical JSON (sorted keys, compact separators, numbers as Python prints them,
 * e.g. `128.0`). `JSON.parse` would turn `128.0` into `128` and lose the signed bytes, so this parser keeps every
 * number's original text and `canonicalize` re-emits it verbatim. It also rejects duplicate keys (ambiguous: which
 * value was signed?), lone surrogates (Python can't have signed them) and absurd nesting.
 */

export class JsonNumber {
  constructor(readonly raw: string) {}
  toNumber(): number {
    return Number(this.raw);
  }
}

export type JsonValue = null | boolean | string | JsonNumber | JsonValue[] | { [key: string]: JsonValue };
export type PlainJson = null | boolean | string | number | PlainJson[] | { [key: string]: PlainJson };

export class JsonError extends Error {
  override name = "JsonError";
}

const MAX_DEPTH = 32;
const MAX_LENGTH = 2_000_000;
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export function parseJson(text: string): JsonValue {
  if (text.length > MAX_LENGTH) throw new JsonError("JSON document is too large");
  let i = 0;
  const ws = () => {
    while (i < text.length && " \t\n\r".includes(text[i] as string)) i++;
  };
  const fail = (msg: string): never => {
    throw new JsonError(`${msg} at offset ${i}`);
  };

  const parseString = (): string => {
    i++; // opening quote
    let out = "";
    for (;;) {
      if (i >= text.length) fail("Unterminated string");
      const ch = text[i] as string;
      if (ch === '"') {
        i++;
        break;
      }
      if (ch === "\\") {
        const esc = text[i + 1];
        const simple: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        if (esc !== undefined && esc in simple) {
          out += simple[esc];
          i += 2;
        } else if (esc === "u") {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("Bad \\u escape");
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else {
          fail("Bad escape");
        }
        continue;
      }
      if (ch < " ") fail("Control character in string");
      out += ch;
      i++;
    }
    if (LONE_SURROGATE.test(out)) fail("Lone surrogate in string");
    return out;
  };

  const parseValue = (depth: number): JsonValue => {
    if (depth > MAX_DEPTH) fail("JSON nested too deeply");
    ws();
    const ch = text[i];
    if (ch === "{") {
      i++;
      const obj: { [key: string]: JsonValue } = Object.create(null);
      ws();
      if (text[i] === "}") {
        i++;
        return obj;
      }
      for (;;) {
        ws();
        if (text[i] !== '"') fail("Expected a string key");
        const key = parseString();
        if (Object.prototype.hasOwnProperty.call(obj, key)) fail(`Duplicate key "${key}"`);
        ws();
        if (text[i] !== ":") fail("Expected ':'");
        i++;
        obj[key] = parseValue(depth + 1);
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "}") {
          i++;
          return obj;
        }
        fail("Expected ',' or '}'");
      }
    }
    if (ch === "[") {
      i++;
      const arr: JsonValue[] = [];
      ws();
      if (text[i] === "]") {
        i++;
        return arr;
      }
      for (;;) {
        arr.push(parseValue(depth + 1));
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "]") {
          i++;
          return arr;
        }
        fail("Expected ',' or ']'");
      }
    }
    if (ch === '"') return parseString();
    if (text.startsWith("true", i)) {
      i += 4;
      return true;
    }
    if (text.startsWith("false", i)) {
      i += 5;
      return false;
    }
    if (text.startsWith("null", i)) {
      i += 4;
      return null;
    }
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(text);
    if (m) {
      i += m[0].length;
      return new JsonNumber(m[0]);
    }
    return fail("Unexpected token");
  };

  const value = parseValue(0);
  ws();
  if (i !== text.length) fail("Trailing characters");
  return value;
}

/** Order keys by Unicode code point, as Python's sort_keys does (JS sorts by UTF-16 code unit). */
export function compareCodePoints(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  for (let k = 0; k < Math.min(x.length, y.length); k++) {
    const d = (x[k] as string).codePointAt(0)! - (y[k] as string).codePointAt(0)!;
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

/** Python `json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`, numbers kept verbatim. */
export function canonicalize(value: JsonValue): string {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "string") return JSON.stringify(value); // same escaping as Python for well-formed strings
  if (value instanceof JsonNumber) return value.raw;
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value).sort(compareCodePoints);
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k] as JsonValue)}`).join(",")}}`;
}

export function toPlain(value: JsonValue): PlainJson {
  if (value instanceof JsonNumber) return value.toNumber();
  if (Array.isArray(value)) return value.map(toPlain);
  if (value !== null && typeof value === "object") {
    const out: { [key: string]: PlainJson } = {};
    for (const k of Object.keys(value)) out[k] = toPlain(value[k] as JsonValue);
    return out;
  }
  return value;
}

export function isObject(v: JsonValue | undefined): v is { [key: string]: JsonValue } {
  return v !== null && v !== undefined && typeof v === "object" && !Array.isArray(v) && !(v instanceof JsonNumber);
}

/** An integer JSON number (no fraction or exponent), as Python's `int` serialises. */
export function isInt(v: JsonValue | undefined): v is JsonNumber {
  return v instanceof JsonNumber && /^-?(0|[1-9]\d*)$/.test(v.raw);
}

/** Serialise with number lexemes kept (optionally indented), so saved receipts still verify byte-exactly. */
export function stringifyLossless(value: JsonValue, indent = 0, depth = 0): string {
  const pad = (d: number) => (indent ? `\n${" ".repeat(indent * d)}` : "");
  if (value === null || typeof value === "boolean") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (value instanceof JsonNumber) return value.raw;
  const sep = indent ? ": " : ":";
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `[${value.map((v) => pad(depth + 1) + stringifyLossless(v, indent, depth + 1)).join(",")}${pad(depth)}]`;
  }
  const keys = Object.keys(value);
  if (!keys.length) return "{}";
  return `{${keys.map((k) => `${pad(depth + 1)}${JSON.stringify(k)}${sep}${stringifyLossless(value[k] as JsonValue, indent,
                                                                                               depth + 1)}`).join(",")}${pad(depth)}}`;
}

/** The lossless JSON text of a top-level field of a JSON document (e.g. "receipt" from an API response). */
export function losslessField(text: string, field: string): string | null {
  const doc = parseJson(text);
  return isObject(doc) && doc[field] !== undefined ? stringifyLossless(doc[field] as JsonValue) : null;
}
