/** Public, copyable examples for /developers. No real secrets, tokens or receipts: values are placeholders. */

export const RECEIPT_JSON = `{
  "payload": {
    "version": "qpg-receipt/2",
    "receipt_id": "AbCdEf0123456789",
    "issued_at": 1792304938,
    "kind": "password",
    "key_id": "0123456789abcdef",
    "evidence": {
      "integrity": "hybrid-signature:ed25519+ml-dsa-65",
      "provenance": "operator-asserted",
      "quantum_evidence": "none"
    },
    "provenance": {
      "sources": ["lfd"],
      "quantum": true,
      "quantum_bytes": 64,
      "mixed_with": "os_csprng",
      "health": { "sp800_90b_style": "pass" }
    },
    "entropy_bits": 129.37,
    "commitment": "<128 hex characters: SHA-512(salt || secret)>",
    "result": null,
    "details": { "length": 20 }
  },
  "signatures": { "ed25519": "<base64url>", "ml-dsa-65": "<base64url>" },
  "algorithms": ["ed25519", "ml-dsa-65"]
}`;

export const SIGNING_MESSAGE = `message   = "QuantumPass-hybrid-sig/1:ed25519+ml-dsa-65\\0" || canonical_json(payload)   # \\0 is one NUL byte
canonical = keys sorted by Unicode code point, separators "," and ":", no whitespace,
            non-ASCII left unescaped (UTF-8), numbers exactly as received ("128.0" stays "128.0")
key_id    = hex(SHA-256(ed25519_pk || ml_dsa_65_pk))[:16]
revoked   = key.status == "revoked" and payload.issued_at >= key.revoked_at`;

export const CURL_EXAMPLE = `BASE=https://quantumpass.example

# 1. A 24-character password with a signed receipt. Anonymous callers are fine; they are rate limited.
#    Save the response untouched: the receipt is verified from its exact bytes.
curl -sS "$BASE/api/v2/password?length=24&receipt=true" -o response.json

# 2. Fetch the key set once and keep your own copy.
curl -sS "$BASE/.well-known/quantumpass-keys.json" -o keys.json

# 3. Ask the server to verify a published receipt by id.
RECEIPT_ID=$(jq -r .receipt.payload.receipt_id response.json)
curl -sS -X POST "$BASE/api/v2/receipts/verify" \\
  -H 'content-type: application/json' \\
  -d "{\\"receipt_id\\": \\"$RECEIPT_ID\\"}"

# The server's verdict is not independent. To check the signatures yourself, use the offline verifier.`;

export const PYTHON_EXAMPLE = `import requests
from verify_receipt import verify  # save backend/scripts/verify_receipt.py next to this file (see "Offline verification")

BASE = "https://quantumpass.example"

res = requests.get(f"{BASE}/api/v2/password", params={"length": 24, "receipt": "true"}, timeout=15)
res.raise_for_status()
body = res.json()
secret, salt, receipt = body["password"], body["receipt_salt"], body["receipt"]

# Fetch the key set once and pin it. Ideally obtain a copy over a channel other than this server.
keys = requests.get(f"{BASE}/.well-known/quantumpass-keys.json", timeout=15).json()

# Pure local computation: nothing below talks to the server, and the secret never leaves this process.
report = verify(receipt, keys, value=secret, salt=salt)
for check in report["checks"]:
    print("ok  " if check["ok"] else "FAIL", check["check"], check.get("detail", ""))
print("integrity:", "valid" if report["valid"] else "INVALID")
if report["valid"]:
    print("provenance (operator-asserted):", report["provenance"]["sources"])
    print("quantum evidence:", report["quantum_evidence"])`;

export const JS_EXAMPLE = `const BASE = ""; // same origin in a browser; use the full origin elsewhere

const res = await fetch(\`\${BASE}/api/v2/password?length=24&receipt=true\`, { cache: "no-store" });
if (!res.ok) throw new Error(\`HTTP \${res.status}, request id \${res.headers.get("x-request-id")}\`);

// Keep the exact text. JSON.parse turns 129.0 into 129, which changes the signed bytes.
const text = await res.text();
const { password, receipt_salt: salt } = JSON.parse(text);

// To save or verify the receipt, cut it out of \`text\` instead of calling JSON.stringify on the parsed object.
// The site's browser verifier does this: see web/lib/verify (parseJson, losslessField, verifyReceiptText).`;

export const IDEMPOTENCY_EXAMPLE = `curl -sS -X POST "$BASE/api/v2/draws" \\
  -H "authorization: Bearer $TOKEN" \\
  -H "idempotency-key: 4f1c9a7e2b6d4c80" \\
  -H 'content-type: application/json' \\
  -d '{"title": "Office raffle", "entries": ["Ada", "Grace", "Linus", "Margaret"], "winners": 2}'

# Repeat the exact request: same body, plus the response header  Idempotent-Replayed: true
# Same key with a different body: 422`;

export const OFFLINE_INSTALL = `pip install cryptography        # needs ML-DSA-65 support; the backend pins cryptography==50.0.2
curl -sS -O ${"https://raw.githubusercontent.com/ahmadhashimi/quantum-password-generator/main/backend/scripts/verify_receipt.py"}`;

export const OFFLINE_COMMANDS = `# A receipt: {"payload", "signatures"}, or a whole API response containing "receipt".
python verify_receipt.py receipt.json keys.json

# A secret receipt, opening the commitment locally with your secret and its salt.
python verify_receipt.py receipt.json keys.json --value "$SECRET" --salt "$SALT"

# A draw: check the published entry list and recompute the winners from the selection seed.
python verify_receipt.py draw.json keys.json --entries entries.json

# Machine-readable report.
python verify_receipt.py receipt.json keys.json --json

# Exit status: 0 valid, 1 invalid, 2 usage or input error.`;

export const QPG_SELECT = `KeyStream(seed) = HMAC-SHA512(seed, counter_be64) for counter = 0, 1, 2, ..., bytes consumed in order
uniform_index(n): k = 1 byte if n <= 256 else 2 bytes (big-endian)
                  limit = 2^(8k) - (2^(8k) mod n)
                  read k bytes until value < limit; return value mod n
winners:          idx = [0 ... N-1]
                  for i in 0 ... w-1: j = i + uniform_index(N - i); swap idx[i], idx[j]
                  return idx[:w]    # indexes into the sorted, NFC-normalised entry list`;
