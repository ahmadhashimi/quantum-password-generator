"""Write the API's OpenAPI document for the web app's generated types.

    cd backend && python -m scripts.export_openapi            # writes web/lib/api/openapi.json
    cd backend && python -m scripts.export_openapi --check    # exits 1 if the committed file is stale (CI)

Then `cd web && npm run gen:api` regenerates web/lib/api/schema.d.ts.
"""

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "web" / "lib" / "api" / "openapi.json"


def build() -> str:
    tmp = tempfile.mkdtemp()
    os.environ.update(ENVIRONMENT="development", DATABASE_URL=f"sqlite:///{tmp}/o.db",
                      SIGNING_KEY_PATH=f"{tmp}/k.json")
    from app.config import get_settings
    from app.main import create_app

    get_settings.cache_clear()
    spec = create_app(get_settings()).openapi()
    return json.dumps(spec, indent=1, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    text = build()
    if a.check:
        if not OUT.exists() or OUT.read_text() != text:
            print(f"{OUT} is stale: run python -m scripts.export_openapi", file=sys.stderr)
            return 1
        return 0
    OUT.write_text(text)
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
