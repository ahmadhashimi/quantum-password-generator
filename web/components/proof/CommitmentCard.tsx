"use client";

import { Lock } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Badge, Button, Callout, Card, CardBody, CardHeader, Field, Input } from "@/components/ui";
import { b64urlDecode } from "@/lib/verify/encoding";
import { checkCommitment } from "@/lib/verify/verify";

import { CopyableValue, SectionBadges, Term } from "./parts";
import { truncateMiddle } from "./proof-data";

function validSalt(salt: string): boolean {
  try {
    return b64urlDecode(salt).length === 32;
  } catch {
    return false;
  }
}

/**
 * Section 3 (password, passphrase, random): open the receipt's salted commitment with your own value. The value and
 * salt live in this component's state, are hashed in the browser, and are never sent anywhere or put in a URL.
 */
export function CommitmentCard({ commitment, initialSalt, verified }: {
  commitment: string;
  initialSalt?: string | undefined;
  verified: boolean;
}) {
  const [value, setValue] = useState("");
  const [salt, setSalt] = useState(initialSalt ?? "");
  const [errors, setErrors] = useState<{ value?: string; salt?: string }>({});
  const [outcome, setOutcome] = useState<"match" | "mismatch" | null>(null);

  function check(e: FormEvent) {
    e.preventDefault();
    const s = salt.trim();
    const next: { value?: string; salt?: string } = {};
    if (!value) next.value = "Enter the value you generated.";
    if (!validSalt(s)) next.salt = "The salt is the 43-character base64url string saved with your receipt.";
    setErrors(next);
    setOutcome(next.value || next.salt ? null : checkCommitment(commitment, value, s) ? "match" : "mismatch");
  }

  return (
    <Card id="commitment">
      <CardHeader icon={<Lock />} title="Secret commitment"
                  description="The receipt holds only a salted fingerprint of your secret. Open it with your value and salt to confirm this receipt is yours."
                  action={<SectionBadges verified={verified}><Badge tone="violet">Checked locally</Badge></SectionBadges>} />
      <CardBody className="space-y-5">
        <dl>
          <Term label="Commitment (SHA-512 of salt followed by value)">
            <CopyableValue value={commitment} label="commitment" display={truncateMiddle(commitment, 32, 16)} />
          </Term>
        </dl>
        <form onSubmit={check} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your value" error={errors.value}
                   hint="The password, passphrase or hex you generated, exactly as generated.">
              {({ id, describedBy, invalid }) => (
                <Input id={id} type="password" autoComplete="off" autoCapitalize="off" spellCheck={false}
                       value={value} aria-describedby={describedBy} aria-invalid={invalid}
                       onChange={(e) => {
                         setValue(e.target.value);
                         setOutcome(null);
                       }} />
              )}
            </Field>
            <Field label="Salt" error={errors.salt} hint="Saved with the receipt download (the “salt” field).">
              {({ id, describedBy, invalid }) => (
                <Input id={id} type="text" autoComplete="off" autoCapitalize="off" spellCheck={false}
                       className="font-mono" value={salt} aria-describedby={describedBy} aria-invalid={invalid}
                       onChange={(e) => {
                         setSalt(e.target.value);
                         setOutcome(null);
                       }} />
              )}
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="secondary">Check commitment</Button>
            <p className="text-xs text-subtle">Checked in your browser; nothing is sent.</p>
          </div>
        </form>
        <div role="status">
          {outcome === "match" && (
            <Callout tone="success" title="Commitment matches">
              This value and salt reproduce the receipt&apos;s commitment, so the receipt was issued for exactly this secret.
            </Callout>
          )}
          {outcome === "mismatch" && (
            <Callout tone="danger" title="Commitment does not match">
              This value and salt do not reproduce the commitment. Check for typos or extra spaces, and that the salt
              belongs to this receipt.
            </Callout>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
