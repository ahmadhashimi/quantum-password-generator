import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DocLayout, type TocItem } from "@/components/docs/DocLayout";
import { DocSection } from "@/components/docs/DocSection";
import { AssumptionsTable, HealthCutoffTable, IbmCapacityTable } from "@/components/docs/EntropyTables";
import { EvidenceTriad } from "@/components/docs/EvidenceTriad";
import { KeySetPanel } from "@/components/docs/KeySetPanel";
import { BulletList, Code, ExternalLink, Prose, repoFile, SubHeading } from "@/components/docs/prose";
import { Badge, ButtonLink, Callout, PageHeader, Section, Table, Td, Th } from "@/components/ui";

export const metadata: Metadata = {
  title: "Transparency",
  description: "What QuantumPass proves, what it only asserts, what is not available, and the limits of the design: " +
    "signing keys, entropy assumptions, draws and the audit log.",
};

const TOC: TocItem[] = [
  { id: "proven", label: "Proven, asserted, absent" },
  { id: "keys", label: "Signing keys" },
  { id: "entropy", label: "Entropy" },
  { id: "draws", label: "Draws" },
  { id: "audit", label: "Audit log" },
  { id: "limits", label: "Limits" },
];

const link = "text-accent underline underline-offset-2 hover:text-accent-strong";

export default function TransparencyPage() {
  return (
    <Section className="pb-20">
      <PageHeader
        eyebrow="Transparency" icon={<ScrollText aria-hidden />}
        title="What is proven, what is asserted, and what is not"
        description={"Quantum-assisted secrets with post-quantum signed evidence. This page says exactly what that " +
                     "evidence covers and where it stops."}
        actions={<ButtonLink href="/status" variant="secondary">Live source status</ButtonLink>} />

      <DocLayout toc={TOC}>
        <DocSection id="proven" title="Proven, asserted, absent"
                    lead="Every receipt answers three different questions. We never merge them into one verdict.">
          <EvidenceTriad />
          <Callout tone="warning" title="What a valid receipt means">
            <p>
              Valid signatures prove what this server signed, not that a quantum device independently attested the
              entropy. The receipt log is server-operated, not an externally anchored transparency log, and the operator
              can withhold results.
            </p>
          </Callout>
          <Prose>
            <p>
              Generated values stay in your browser. Receipts store a salted commitment only. Check any receipt in the{" "}
              <Link href="/verify" prefetch={false} className={link}>Proof Explorer</Link> or offline, as described in the{" "}
              <Link href="/developers#verification" prefetch={false} className={link}>Evidence API docs</Link>.
            </p>
          </Prose>
        </DocSection>

        <DocSection id="keys" title="Signing keys"
                    lead="Every receipt is signed with two algorithms at once. Both signatures must verify.">
          <KeySetPanel />
          <Prose>
            <p>
              A key pair is an Ed25519 key and an ML-DSA-65 key (FIPS 204, lattice-based). The <Code>key_id</Code> is the
              first 16 hex characters of SHA-256 over the two public keys. The post-quantum signature protects a receipt&apos;s
              integrity against future quantum computers; it says nothing about how a secret was generated.
            </p>
          </Prose>
          <SubHeading>Rotation and revocation</SubHeading>
          <Table className="min-w-[36rem]">
            <thead>
              <tr><Th>Status</Th><Th>When</Th><Th>Effect on verification</Th></tr>
            </thead>
            <tbody>
              <tr>
                <Td><Badge tone="success">Active</Badge></Td>
                <Td className="text-muted">The current signer.</Td>
                <Td className="text-muted">Signs new receipts.</Td>
              </tr>
              <tr>
                <Td><Badge tone="neutral">Retired</Badge></Td>
                <Td className="text-muted">Routine rotation, yearly or when an operator with access leaves.</Td>
                <Td className="text-muted">Receipts it signed keep verifying.</Td>
              </tr>
              <tr>
                <Td><Badge tone="danger">Revoked</Badge></Td>
                <Td className="text-muted">Suspected compromise. <Code>revoked_at</Code> is set to the earliest time the key
                  may have been exposed.</Td>
                <Td className="text-muted">
                  Receipts with <Code>issued_at &gt;= revoked_at</Code> fail with <Code>revoked_key</Code>, on the server and in
                  offline verifiers that use the published key set. Earlier receipts stay valid.
                </Td>
              </tr>
            </tbody>
          </Table>
          <Prose>
            <p>
              On a revocation the key id, the <Code>revoked_at</Code> time and the reason are published here, and the panel
              above flags the key. Keys are held by the operator; there is no hardware security module or KMS behind the
              signing key yet. Download the key set once over a channel you trust and verify against that copy.
            </p>
          </Prose>
        </DocSection>

        <DocSection id="entropy" title="Entropy"
                    lead="Where the bytes come from, what we assume about them, and what the health tests can and cannot detect.">
          <Callout tone="warning" title="Not a NIST validation">
            <p>
              Health tests are SP 800-90B-style RCT/APT screening (not a NIST validation). No part of this system is NIST,
              FIPS or GLI certified, and it has no Entropy Source Validation.
            </p>
          </Callout>
          <SubHeading>Pipeline</SubHeading>
          <Prose>
            <BulletList ordered>
              <li>
                <strong className="text-fg">Sources.</strong> IBM QPU jobs fill a pool of conditioned bytes. ANU and LfD
                quantum random number services fill small live buffers. The OS CSPRNG is always available.
              </li>
              <li>
                <strong className="text-fg">Screening.</strong> Every byte from a quantum source goes through a Repetition
                Count Test and an Adaptive Proportion Test. A failing source is quarantined and the request falls back to the
                next one.
              </li>
              <li>
                <strong className="text-fg">Mixing.</strong> Each request takes 64 bytes from the IBM pool (signed-in users,
                within a quota), 64 bytes from one live service if it is healthy, and 64 bytes from the OS CSPRNG. They go
                through HKDF-SHA512 into a 64-byte key, expanded by an HMAC-SHA512 counter-mode keystream.
              </li>
              <li>
                <strong className="text-fg">Sampling.</strong> Rejection sampling turns the keystream into characters, words,
                bytes or draw indexes without modulo bias.
              </li>
            </BulletList>
          </Prose>

          <SubHeading>Assumptions</SubHeading>
          <AssumptionsTable />

          <SubHeading>Health tests</SubHeading>
          <HealthCutoffTable />
          <Prose>
            <p>
              Cutoffs follow SP 800-90B section 4.4 with a false-positive rate of 2<sup>-20</sup> and an APT window of 512
              samples. They are computed in <Code>backend/app/entropy/health.py</Code>.
            </p>
            <p>
              The standard intends these tests to run inside the entropy source, on raw noise. ANU and LfD send already
              post-processed output over HTTPS, so the tests catch gross failures only: stuck or constant output, truncated
              or zero-filled responses, heavy bias. They cannot tell real quantum output from a good PRNG, and they cannot
              detect a provider that is compromised but statistically clean. IBM raw bits are closer to the noise source, but
              the tests still run on results received over the network, not on the hardware.
            </p>
          </Prose>

          <SubHeading>IBM capacity</SubHeading>
          <IbmCapacityTable />
          <Prose>
            <p>
              One harvest job is a layer of Hadamard gates and a measurement on every qubit. When the IBM budget or pool runs
              out, the order is <strong className="text-fg">IBM pool, then ANU, then LfD, then the OS CSPRNG alone</strong>.
              Each step is labelled in the response and the receipt, and none of them blocks generation. Live availability is
              on the <Link href="/status" prefetch={false} className={link}>source status page</Link>.
            </p>
          </Prose>

          <SubHeading>What the numbers mean</SubHeading>
          <Prose>
            <BulletList>
              <li>
                <Code>entropy_bits</Code> is log2 of the size of the output space the secret was sampled from, not a
                measurement of qubit min-entropy.
              </li>
              <li>
                <Code>provenance.sources</Code> lists only sources whose bytes were mixed into that request. A provider that
                failed, was rate limited or was cooling down is not listed.
              </li>
              <li>
                <Code>quantum_bytes</Code> counts bytes, not min-entropy. Pool bytes count as quantum only if every pool
                chunk came from a hardware job. The IBM simulator is classical, is labelled <Code>ibm_simulator</Code> and is
                never counted as quantum.
              </li>
              <li>
                All of it is operator-asserted. Receipts sign the claims; the signature does not prove them true.
              </li>
            </BulletList>
          </Prose>
          <Callout tone="neutral" title="What a quantum source adds">
            <p>
              Every request mixes in 64 bytes of OS randomness. Assuming a secure OS CSPRNG and a correct HKDF and HMAC
              implementation, a broken or hostile QRNG should not reduce output unpredictability below that baseline. That is
              a conditional engineering argument, not a guarantee under a compromised host. A quantum source does not make a
              secret stronger than a correctly used OS CSPRNG; what it adds is signed provenance statements you can inspect.
            </p>
          </Callout>
        </DocSection>

        <DocSection id="draws" title="Draws"
                    lead="Commit the entry list, run once, publish the seed. Anyone can recompute the winners.">
          <Prose>
            <BulletList>
              <li>
                <strong className="text-fg">Commit, then run.</strong> The signed commit receipt fixes a SHA-256 fingerprint of
                the sorted, normalised entry list before any randomness exists. The result receipt publishes the selection
                seed and the winners.
              </li>
              <li>
                <strong className="text-fg">At most once.</strong> A committed draw executes once. The seed is saved in the same
                statement that claims the draw. Retries return the stored result and never draw fresh randomness. A
                concurrent run that loses the race writes nothing.
              </li>
              <li>
                <strong className="text-fg">Visible re-rolls.</strong> Verification reports how many draws the same owner, and
                anyone, ran over the same entry fingerprint, and how long the list was committed before the run.
              </li>
              <li>
                <strong className="text-fg">Limits.</strong> Sign-in required, 50 draws per user per day, up to 10,000 entries
                (256,000 bytes) and 100 winners, entries of 1 to 200 characters.
              </li>
            </BulletList>
          </Prose>
          <SubHeading>Recovery rules</SubHeading>
          <Prose>
            <p>
              The service runs as a single instance, so a draw still marked seeded at startup was interrupted between claim
              and finish.
            </p>
            <BulletList ordered>
              <li>At startup every seeded draw becomes <Code>needs_investigation</Code> and is audited. It is never re-run
                automatically.</li>
              <li>An administrator reviews it with its persisted seed provenance and the logs around the run.</li>
              <li>Completion recomputes the winners from the <em>persisted</em> seed with zero fresh randomness. The receipt
                carries <Code>details.recovered: true</Code> and the audit event names the administrator.</li>
              <li>If the persisted seed itself is suspect, for example after a restore from a mid-run backup, the draw is not
                completed. The owner is told and commits a new draw, and the re-roll counter shows it.</li>
            </BulletList>
          </Prose>
          <Callout tone="warning" title="What a draw receipt does not prove">
            <p>
              The server chooses the seed at run time. A dishonest operator with database access could compute winners for
              many seeds privately and publish only one. Receipts make every <em>published</em> re-roll visible; they cannot
              reveal draws that were never issued. The operator can also choose when to run a draw or withhold a result. A
              public randomness beacon (drand) fixed at commit time is planned, not shipped. Not for regulated gambling or
              lotteries.
            </p>
          </Callout>
          <Prose>
            <p>
              Protocol details and the <Code>qpg-select/1</Code> algorithm are in the{" "}
              <Link href="/developers#draws" prefetch={false} className={link}>Evidence API docs</Link>.{" "}
              <ExternalLink href={repoFile("docs/DRAWS.md")}>DRAWS.md</ExternalLink>
            </p>
          </Prose>
        </DocSection>

        <DocSection id="audit" title="Audit log"
                    lead="An append-only record of what the service did, chained so edits and deletions are detectable.">
          <Prose>
            <BulletList>
              <li>
                Each event stores the hash of the previous one. On PostgreSQL a trigger rejects updates and deletes.
              </li>
              <li>
                It records the draw lifecycle (commit, seeded, run, needs investigation, administrator completion), key
                loads and rotations, entropy-provider trouble and IBM job submissions, budget kill-switch events, denied
                admin access and account deletions.
              </li>
              <li>
                Events hold actions, actors, targets and coarse details such as counts, fingerprints and source names. They
                do not hold generated secrets or draw seeds.
              </li>
              <li>
                Operators can verify the whole chain at any time (<Code>GET /api/v2/admin/audit/verify</Code> returns{" "}
                <Code>ok</Code>, the event count, the first bad sequence number and the head hash). The restore test runs it
                on every restored backup.
              </li>
            </BulletList>
          </Prose>
          <Callout tone="warning" title="No external anchoring yet">
            <p>
              The chain detects edits and deletions, but an attacker who can rewrite the whole chain and the database could
              forge a consistent history. The log is readable by administrators, not published. Signed external checkpoints
              in an anchored transparency log are planned for V3.
            </p>
          </Callout>
        </DocSection>

        <DocSection id="limits" title="Limits"
                    lead="What this service does not do, stated plainly.">
          <Prose>
            <BulletList>
              <li>Provenance is operator-asserted. A valid receipt does not prove that any quantum source contributed.</li>
              <li>
                There is no independent quantum evidence. IBM does not sign job results, and third parties cannot fetch
                someone else&apos;s job.
              </li>
              <li>
                The receipt log is server-operated, with no inclusion proofs. The operator can withhold results.
              </li>
              <li>
                Not NIST, FIPS or GLI certified, and not for regulated gambling or lotteries. Health tests are screening, not
                a validation.
              </li>
              <li>
                The raw IBM entropy figure (A2) is assumed, not measured, and conditioned IBM bytes are not claimed to be
                full-entropy (A3). Measuring it needs non-IID estimators run on at least 1,000,000 raw samples per backend.
              </li>
              <li>
                An independent cryptographic design review of the mixing, conditioning and receipt scheme has not been done
                yet.
              </li>
              <li>
                The IBM pool is persisted at most every 30 seconds, so after a crash up to 30 seconds of already-served pool
                bytes can be served again. They are always mixed with fresh OS randomness, but two receipts may then cite the
                same IBM job bytes.
              </li>
              <li>
                The service is a single instance: rate limits, the entropy pool and chat sessions live in process memory.
              </li>
            </BulletList>
          </Prose>
          <Prose>
            <p>
              The threat model, the controls and the findings of the adversarial review are in{" "}
              <ExternalLink href={repoFile("docs/SECURITY.md")}>SECURITY.md</ExternalLink>. The entropy assumptions are
              written up in <ExternalLink href={repoFile("docs/ENTROPY.md")}>ENTROPY.md</ExternalLink>.
            </p>
          </Prose>
        </DocSection>
      </DocLayout>
    </Section>
  );
}
