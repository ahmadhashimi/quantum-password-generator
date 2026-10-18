"use client";

import { FileUp } from "lucide-react";
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { Button, Card, CardBody, CardHeader, Field, Tabs, Textarea } from "@/components/ui";
import { api } from "@/lib/api/client";
import { KeySet } from "@/lib/api/schemas";
import { isObject, parseJson, toPlain } from "@/lib/verify/json";

import { LoadError } from "./LoadError";
import type { KeySource } from "./IntegrityCard";
import { ProofReport } from "./ProofReport";
import { ProofSkeleton } from "./ProofSkeleton";
import { useRemote } from "./useRemote";

const MAX_FILE_BYTES = 2_000_000;

interface Submission {
  id: number;
  text: string;
  /** A salt in the document (the receipt download includes one): kept in the browser, offered to the commitment form. */
  salt: string | undefined;
  /** Keys bundled in an evidence export. Not independent: whoever made the file chose them. */
  bundledKeys: KeySet | null;
}

function inspect(text: string): { salt: string | undefined; bundledKeys: KeySet | null } {
  try {
    const doc = parseJson(text);
    if (!isObject(doc)) return { salt: undefined, bundledKeys: null };
    const bundled = isObject(doc.keys) ? KeySet.safeParse(toPlain(doc.keys)) : null;
    return { salt: typeof doc.salt === "string" ? doc.salt : undefined, bundledKeys: bundled?.success ? bundled.data : null };
  } catch {
    return { salt: undefined, bundledKeys: null }; // the report explains why the text isn't a receipt
  }
}

function readText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Verify a pasted or uploaded document entirely in the browser; the only request is for the public key set. */
export function LocalVerify() {
  const [text, setText] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [keySource, setKeySource] = useState<KeySource>("published");
  const [attempt, setAttempt] = useState(0);
  const counter = useRef(0);
  const report = useRef<HTMLDivElement>(null);

  const published = useRemote(submission ? `keys:${attempt}` : null, useCallback(
    (signal: AbortSignal) => api("/.well-known/quantumpass-keys.json", { schema: KeySet, signal }),
    [],
  ));

  useEffect(() => {
    if (submission) report.current?.focus(); // moves screen reader and keyboard users to the new result
  }, [submission]);

  function verify(raw: string) {
    counter.current += 1;
    setSubmission({ id: counter.current, text: raw, ...inspect(raw) });
    setKeySource("published");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (text.trim()) verify(text);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError("That file is over 2 MB. Receipts are a few kilobytes.");
      input.value = "";
      return;
    }
    try {
      const content = await readText(file);
      setText(content);
      setFileError(null);
      verify(content);
    } catch {
      setFileError("That file couldn't be read.");
    }
    input.value = ""; // lets the same file be chosen again
  }

  const keys = keySource === "bundled" && submission?.bundledKeys
    ? { status: "ok" as const, data: submission.bundledKeys }
    : published;

  return (
    <>
      <Card>
        <CardHeader icon={<FileUp />} title="Verify a file in your browser"
                    description="Paste or upload a receipt, a draw response or an evidence export. The check runs here; the only request is for this site's public key set." />
        <CardBody>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <Field label="Receipt, draw response or evidence export (JSON)">
              {({ id, describedBy }) => (
                <Textarea id={id} rows={8} spellCheck={false} className="font-mono text-xs" value={text}
                          aria-describedby={describedBy} placeholder='{"payload": {…}, "signatures": {…}}'
                          onChange={(e) => setText(e.target.value)} />
              )}
            </Field>
            <Field label="Or choose a .json file" error={fileError ?? undefined}
                   hint="The file is read by your browser and never uploaded.">
              {({ id, describedBy, invalid }) => (
                <input id={id} type="file" accept=".json,application/json" aria-describedby={describedBy}
                       aria-invalid={invalid} onChange={(e) => void onFile(e)}
                       className="block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-md file:border
                                  file:border-border-strong file:bg-surface-raised file:px-3 file:py-2 file:text-sm
                                  file:font-medium file:text-fg hover:file:bg-bg-subtle" />
              )}
            </Field>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={!text.trim()}>Verify in my browser</Button>
              <Button variant="ghost" disabled={!text && !submission}
                      onClick={() => {
                        setText("");
                        setFileError(null);
                        setSubmission(null);
                      }}>
                Clear
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {submission && (
        <div ref={report} tabIndex={-1} role="region" aria-label="Verification report"
             className="scroll-mt-24 space-y-6 outline-none">
          {submission.bundledKeys && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-fg">Check the signatures against</p>
              <Tabs label="Key set" value={keySource} onChange={setKeySource}
                    options={[{ value: "published", label: "This site's published keys" },
                              { value: "bundled", label: "Keys in the file" }]} />
            </div>
          )}
          {keys.status === "error" ? (
            <LoadError title="Couldn't load the published key set" onRetry={() => setAttempt((n) => n + 1)}>
              Your browser needs the public keys to check the signatures. {keys.message}
              {submission.bundledKeys ? " You can instead check against the keys in the file, which is less independent." : ""}
            </LoadError>
          ) : keys.status === "ok" ? (
            <ProofReport key={`${submission.id}:${keySource}`} receiptText={submission.text} keys={keys.data}
                         keySource={keySource} server={{ status: "idle" }} material={{ status: "idle" }}
                         initialSalt={submission.salt} />
          ) : (
            <ProofSkeleton />
          )}
        </div>
      )}
    </>
  );
}
