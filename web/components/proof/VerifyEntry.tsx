"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button, Card, CardBody, CardHeader, Field, Input } from "@/components/ui";

import { LocalVerify } from "./LocalVerify";
import { extractReceiptId } from "./proof-data";

function OpenById() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  function open(e: FormEvent) {
    e.preventDefault();
    const id = extractReceiptId(value);
    if (!id) {
      setError("Receipt IDs are 16 characters: letters, digits, “-” and “_”.");
      return;
    }
    setError(undefined);
    router.push(`/verify/${id}`);
  }

  return (
    <Card>
      <CardHeader icon={<Search />} title="Open a receipt by ID"
                  description="Every receipt has a 16-character ID. Your browser fetches the receipt and the public keys, then checks the signatures itself." />
      <CardBody>
        <form onSubmit={open} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <Field label="Receipt ID" error={error} className="flex-1"
                 hint="Pasting a full /verify link works too.">
            {({ id, describedBy, invalid }) => (
              <Input id={id} className="font-mono" value={value} autoComplete="off" autoCapitalize="off" spellCheck={false}
                     aria-describedby={describedBy} aria-invalid={invalid} placeholder="3JGdISaLMR84RtF1"
                     onChange={(e) => setValue(e.target.value)} />
            )}
          </Field>
          <Button type="submit" className="sm:mt-7">Open receipt</Button>
        </form>
      </CardBody>
    </Card>
  );
}

/** The two ways into the Proof Explorer: by receipt ID, or by verifying a document locally. */
export function VerifyEntry() {
  return (
    <div className="space-y-8">
      <OpenById />
      <LocalVerify />
    </div>
  );
}
