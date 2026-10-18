import type { ReactNode } from "react";

import { Table, Td, Th } from "@/components/ui";

import { Code } from "./prose";

function Rows({ rows, head }: { rows: [ReactNode, ReactNode, ReactNode][]; head: [string, string, string] }) {
  return (
    <Table className="min-w-[36rem]">
      <thead>
        <tr>{head.map((h) => <Th key={h}>{h}</Th>)}</tr>
      </thead>
      <tbody>
        {rows.map(([a, b, c], i) => (
          <tr key={i}>
            <Td className="font-mono text-xs font-semibold whitespace-nowrap">{a}</Td>
            <Td className="text-xs text-subtle">{b}</Td>
            <Td className="text-muted">{c}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function ReceiptFieldTable() {
  return (
    <Rows head={["Field", "Type", "Meaning"]} rows={[
      ["version", "string", <>
        <Code>qpg-receipt/2</Code> for new receipts. <Code>qpg-receipt/1</Code> stays verifiable.
      </>],
      ["receipt_id", "string", <>16 characters of <Code>A-Za-z0-9_-</Code>. The id in <Code>/api/v2/receipts/{"{id}"}</Code> and{" "}
        <Code>/verify/{"{id}"}</Code>.</>],
      ["issued_at", "integer", "Unix seconds. Not before 2026-01-01 and at most 5 minutes in the future."],
      ["kind", "string", <>One of <Code>password</Code>, <Code>passphrase</Code>, <Code>random</Code>,{" "}
        <Code>draw_commit</Code>, <Code>draw</Code>.</>],
      ["key_id", "string", <>16 hex characters: the first 16 of SHA-256(ed25519 public key ‖ ML-DSA-65 public key).</>],
      ["evidence", "object (v2)", <>Exactly the three constants under <a href="#evidence" className="text-accent underline">
        evidence classes</a>. Anything else is rejected.</>],
      ["provenance", "object", <>
        Operator-asserted. <Code>sources</Code> (up to 8 names), <Code>quantum</Code> (boolean),{" "}
        <Code>quantum_bytes</Code> (0 to 1,048,576, counts bytes, not min-entropy), <Code>mixed_with</Code>{" "}
        (<Code>os_csprng</Code> or <Code>none</Code>), optional <Code>ibm_jobs</Code> (up to 64 of{" "}
        <Code>{"{backend, job_id | null, mode: hardware | simulator}"}</Code>), optional <Code>health</Code>{" "}
        (test name to <Code>pass</Code> or <Code>n/a</Code>).
      </>],
      ["entropy_bits", "number | null", "log2 of the output space the secret was sampled from, 0 to 8192. Not a measurement of physical entropy."],
      ["commitment", "string | null", <>128 hex characters: SHA-512(salt ‖ UTF-8 secret). Secret kinds only.</>],
      ["result", "object | null", "The public draw result. Null for every other kind."],
      ["details", "object", "Per-kind fields, below."],
      ["signatures", "object, outside payload", <>
        base64url <Code>ed25519</Code> (64 bytes) and <Code>ml-dsa-65</Code> (3,309 bytes). Both are required.
      </>],
      ["algorithms", "array, outside payload", "Informational and unsigned. It never overrides the two-signature rule."],
    ]} />
  );
}

export function KindRulesTable() {
  return (
    <Rows head={["Kind", "commitment / result", "details"]} rows={[
      ["password, passphrase, random", <>128-hex commitment, <Code>result: null</Code></>,
        <><Code>length</Code>, <Code>words</Code> or <Code>bytes</Code>: small positive integers only.</>],
      ["draw_commit", <><Code>commitment: null</Code>, <Code>result: null</Code></>,
        <><Code>draw_id</Code>, <Code>title</Code>, <Code>entries_count</Code>, <Code>entries_sha256</Code>,{" "}
          <Code>winners</Code>.</>],
      ["draw", <>
        <Code>commitment: null</Code>, <Code>{"result: {winners: [{index, entry}], selection: {algorithm: \"qpg-select/1\", seed_hex}}"}</Code>
      </>, <>As <Code>draw_commit</Code>, plus <Code>commit_receipt_id</Code> and, after operator recovery,{" "}
        <Code>recovered: true</Code>.</>],
    ]} />
  );
}
