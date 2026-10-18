#!/usr/bin/env bash
# Post-deploy smoke test.  deploy/smoke.sh https://your.domain
set -euo pipefail
base=${1:?usage: smoke.sh https://your.domain}
fail() { echo "FAIL: $*" >&2; exit 1; }
hdr() { curl -fsS -o /dev/null -D - "$base$1" | tr -d '\r'; }

echo "== api health";   curl -fsS "$base/api/v2/health" | grep -q '"status":"ok"' || fail "api health"
echo "== web health";   curl -fsS "$base/healthz" | grep -q ok || fail "web health"
echo "== key set";      curl -fsS "$base/.well-known/quantumpass-keys.json" | grep -q '"key_id"' || fail "key set"
echo "== api headers";  h=$(hdr /api/v2/health)
grep -qi '^cache-control: no-store' <<<"$h" || fail "api responses must be no-store"
grep -qi "^content-security-policy: default-src 'none'" <<<"$h" || fail "api CSP"
echo "== page headers"; h=$(hdr /generate)
grep -qi '^content-security-policy:.*nonce-' <<<"$h" || fail "page CSP nonce"
grep -qi '^cache-control: no-store' <<<"$h" || fail "/generate must be no-store"
grep -qi '^strict-transport-security:' <<<"$h" || fail "HSTS"
grep -qi '^x-frame-options: DENY' <<<"$h" || fail "X-Frame-Options"
echo "== receipt round trip"
r=$(curl -fsS "$base/api/v2/random?bytes=16&receipt=true")
rid=$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["receipt"]["payload"]["receipt_id"])' <<<"$r")
python3 - "$base" "$rid" <<'PY' || fail "receipt verify"
import json, sys, urllib.request
base, rid = sys.argv[1:]
req = urllib.request.Request(f"{base}/api/v2/receipts/verify", data=json.dumps({"receipt_id": rid}).encode(),
                             headers={"content-type": "application/json"})
v = json.load(urllib.request.urlopen(req))
assert v["valid"] and v["in_public_log"], v
PY
echo "== status page";  curl -fsS "$base/status" >/dev/null || fail "status page"
echo "smoke test passed: $base"
