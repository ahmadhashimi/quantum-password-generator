"use client";

import { Download, Terminal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button, Card, CardBody, CardHeader, CodeBlock } from "@/components/ui";
import type { KeySet, VerifyResult } from "@/lib/api/schemas";
import { downloadText } from "@/lib/download";
import type { BrowserVerification } from "@/lib/verify/verify";

import { linkClass, useOrigin } from "./parts";
import { buildEvidence, isDrawKind, isSecretKind, type Optional, type PayloadView, SCRIPT_URL } from "./proof-data";

/** Section 8: save everything needed to re-check this receipt without this website. */
export function ExportCard({ view, receiptText, keys, browser, server }: {
  view: PayloadView;
  receiptText: string;
  keys: KeySet;
  browser: BrowserVerification;
  server: Optional<VerifyResult>;
}) {
  const origin = useOrigin();
  const [saved, setSaved] = useState<"idle" | "saved" | "failed">("idle");
  const file = `evidence-${view.receiptId}.json`;

  function save() {
    const text = buildEvidence({ receiptText, keys, browser, server: server.status === "ok" ? server.data : null,
                                 exportedAt: new Date() });
    if (text === null) {
      setSaved("failed");
      return;
    }
    downloadText(file, text);
    setSaved("saved");
  }

  const extra = isSecretKind(view.kind)
    ? `# a secret receipt: also check your value and salt (they stay on your machine)\npython verify_receipt.py ${file} keys.json --value "YOUR VALUE" --salt "YOUR SALT"`
    : isDrawKind(view.kind)
      ? `# a draw: also check the published entry list (a JSON array of strings)\npython verify_receipt.py ${file} keys.json --entries entries.json`
      : null;
  const commands = [
    "pip install cryptography",
    `curl -o keys.json ${origin || "https://YOUR-QUANTUMPASS-HOST"}/.well-known/quantumpass-keys.json`,
    `python verify_receipt.py ${file} keys.json`,
    ...(extra ? ["", extra] : []),
  ].join("\n");

  return (
    <Card id="export">
      <CardHeader icon={<Download />} title="Evidence export and offline check"
                  description="Save the receipt, the key set, the canonical bytes and every check, then re-verify them without this website." />
      <CardBody className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save}><Download className="size-4" aria-hidden /> Download evidence (JSON)</Button>
          <p role="status" className="text-xs text-subtle">
            {saved === "saved" ? `Saved ${file}. It never contains your value or salt.` : ""}
            {saved === "failed" ? "The evidence file couldn't be built from this document." : ""}
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Terminal className="size-4 text-accent" aria-hidden /> Verify offline with Python
          </h3>
          <p className="text-sm text-muted">
            The script needs only Python 3.12+ and the <code className="font-mono text-xs">cryptography</code> package. It
            is a separate implementation of the published algorithm. Fetch the key set yourself rather than trusting the
            keys bundled in the export, and compare the key ID with a copy you trust.
          </p>
          <CodeBlock language="shell" code={commands} />
          <p className="text-xs text-subtle">
            Anything typed on a command line can end up in your shell history, so check secrets on a machine you trust.
          </p>
          <p className="text-sm text-muted">
            <a href={SCRIPT_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
              verify_receipt.py on GitHub
            </a>
            {" · "}
            <Link href="/developers#offline" prefetch={false} className={linkClass}>Offline verification guide</Link>
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
