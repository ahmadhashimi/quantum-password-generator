import type { ReactNode } from "react";

import { Badge, Table, Td, type Tone, Th } from "@/components/ui";

import { Code } from "./prose";

type Basis = "assumed" | "standard" | "enforced";

const BASIS: Record<Basis, { label: string; tone: Tone }> = {
  assumed: { label: "Assumed", tone: "warning" },
  standard: { label: "Standard assumption", tone: "neutral" },
  enforced: { label: "Enforced and tested", tone: "success" },
};

const ASSUMPTIONS: { id: string; text: ReactNode; basis: Basis; note: ReactNode }[] = [
  {
    id: "A1", basis: "assumed",
    text: "ANU and LfD deliver post-processed output with at least 7 bits of min-entropy per byte.",
    note: "Taken from the providers' published descriptions. We have not measured it.",
  },
  {
    id: "A2", basis: "assumed",
    text: "Raw IBM QPU bits carry at least 2 bits of min-entropy per byte despite readout bias and crosstalk.",
    note: "Deliberately conservative, but not an SP 800-90B estimate on our own data.",
  },
  {
    id: "A3", basis: "assumed",
    text: "SHA-256 truncated to 16 bytes over each 64 raw bytes extracts the raw min-entropy.",
    note: "At 2 bits per byte, 64 raw bytes carry 128 bits and 16 output bytes need 128: a 1:1 claim with no safety " +
      "margin. We do not claim the conditioned IBM bytes are full-entropy.",
  },
  {
    id: "A4", basis: "standard",
    text: "The operating system CSPRNG is sound (Linux getrandom).",
    note: "Mixed into every request.",
  },
  {
    id: "A5", basis: "standard",
    text: "HKDF-SHA512 yields a uniform key if either input carries at least 256 bits of min-entropy.",
    note: "The standard extractor assumption (RFC 5869). It is why output should not fall below the OS CSPRNG baseline.",
  },
  {
    id: "A6", basis: "standard",
    text: "HMAC-SHA512 in counter mode is a secure generator for one request's output.",
    note: <>Sound construction, but not SP 800-90A HMAC_DRBG: no reseed or prediction-resistance machinery. Each stream
      lives for one request.</>,
  },
  {
    id: "A7", basis: "enforced",
    text: "Rejection sampling yields uniform indexes.",
    note: "Exact: out-of-range values are rejected, so there is no modulo bias.",
  },
  {
    id: "A8", basis: "enforced",
    text: "A source that fails a health test contributes nothing to that request.",
    note: "Failing batches are dropped and the circuit breaker opens after 3 failures.",
  },
];

export function AssumptionsTable() {
  return (
    <Table className="min-w-[44rem]">
      <caption className="sr-only">Entropy pipeline assumptions A1 to A8</caption>
      <thead>
        <tr><Th>#</Th><Th>Assumption</Th><Th>Basis</Th><Th>Note</Th></tr>
      </thead>
      <tbody>
        {ASSUMPTIONS.map((a) => (
          <tr key={a.id}>
            <Td className="font-mono text-xs font-semibold">{a.id}</Td>
            <Td>{a.text}</Td>
            <Td className="whitespace-nowrap"><Badge tone={BASIS[a.basis].tone}>{BASIS[a.basis].label}</Badge></Td>
            <Td className="text-muted">{a.note}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function HealthCutoffTable() {
  return (
    <Table className="min-w-[30rem]">
      <caption className="sr-only">Health test cutoffs by source</caption>
      <thead>
        <tr><Th>Source</Th><Th>Assessed entropy</Th><Th>RCT cutoff</Th><Th>APT cutoff (W = 512)</Th></tr>
      </thead>
      <tbody>
        <tr>
          <Td>ANU, LfD</Td><Td className="tabular-nums">7 bits per byte</Td>
          <Td className="tabular-nums">4</Td><Td className="tabular-nums">18</Td>
        </tr>
        <tr>
          <Td>IBM raw bits, read as bytes</Td><Td className="tabular-nums">2 bits per byte</Td>
          <Td className="tabular-nums">11</Td><Td className="tabular-nums">178</Td>
        </tr>
      </tbody>
    </Table>
  );
}

export function IbmCapacityTable() {
  return (
    <Table className="min-w-[30rem]">
      <caption className="sr-only">IBM harvest capacity</caption>
      <thead>
        <tr><Th>Quantity</Th><Th>Value</Th></tr>
      </thead>
      <tbody>
        <tr><Td>Qubits × shots per job</Td><Td className="tabular-nums">127 × 2,048</Td></tr>
        <tr><Td>Raw output</Td><Td className="tabular-nums">260,096 bits = 32,512 bytes</Td></tr>
        <tr><Td>After 4:1 conditioning</Td><Td className="tabular-nums">8,128 bytes</Td></tr>
        <tr><Td>Seeds per job (64 bytes each)</Td><Td className="tabular-nums">127</Td></tr>
        <tr>
          <Td>Job cap</Td>
          <Td>
            <Code>IBM_MAX_JOBS_PER_DAY</Code> = 2 per rolling 24 hours, restored from the audit log at startup so a restart
            cannot reset it
          </Td>
        </tr>
        <tr>
          <Td>Open Plan allowance</Td>
          <Td>10 QPU-minutes per 28 days. At the cap that is about 56 jobs per 28 days, each a few seconds of QPU time</Td>
        </tr>
        <tr>
          <Td>Seeds per day at the cap</Td>
          <Td className="tabular-nums">about 250, for signed-in users only (20 per user per day by default)</Td>
        </tr>
      </tbody>
    </Table>
  );
}
