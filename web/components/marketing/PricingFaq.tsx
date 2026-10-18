import { Block } from "./Block";
import { Faq } from "./Faq";
import { TextLink } from "./links";

const ITEMS = [
  {
    q: "What is quantum about it?",
    a: (
      <>
        <p>
          Entropy comes from quantum sources: bits measured on IBM Quantum processors, plus the ANU and LfD quantum
          random number services. Each batch is screened, then always mixed with 64 bytes from the operating
          system&apos;s CSPRNG through HKDF-SHA512. Every result says which sources contributed.
        </p>
        <p>
          The quantum input adds defence in depth and a provenance record. It does not make a password stronger than a
          correctly used OS CSPRNG: strength is length.
        </p>
      </>
    ),
  },
  {
    q: "Is it certified?",
    a: (
      <p>
        No. There is no FIPS, NIST, GLI or other certification. The health tests are SP 800-90B-style RCT/APT screening,
        not a NIST validation. Instead, the receipt format and verification algorithm are public so you can check them
        yourself. The limits are written down on the <TextLink href="/transparency">transparency page</TextLink>.
      </p>
    ),
  },
  {
    q: "What happens when IBM time runs out?",
    a: (
      <>
        <p>
          IBM Quantum time is scarce, so the server caps how many QPU jobs it runs per day, keeps the bytes in a pool
          and gives each signed-in account a daily seed allowance. When the pool is empty, a request uses ANU or LfD if
          one is healthy, and otherwise the OS CSPRNG alone.
        </p>
        <p>
          The result and its receipt say which sources were used. A simulator is labelled &quot;not quantum&quot;, and a
          source that was unavailable is never shown as contributing. Live state is on the{" "}
          <TextLink href="/status">Source Monitor</TextLink>.
        </p>
      </>
    ),
  },
  {
    q: "Can you see my secrets?",
    a: (
      <>
        <p>
          Not after delivery. The value is generated on our server, sent to your browser once over TLS with caching
          disabled, and never written to the database or the logs. The receipt keeps only a salted SHA-512 commitment,
          and the salt goes only to you. The security assistant is built so it never sees generated values.
        </p>
        <p>
          The server process does hold the value in memory for the length of the request. If that is not acceptable for
          a key, generate it yourself: a customer-hosted option that mixes locally is on the roadmap, not available.
        </p>
      </>
    ),
  },
  {
    q: "Does a receipt prove the bytes were quantum?",
    a: (
      <p>
        No. A valid receipt proves what this server signed. The sources, IBM job ids and health results inside it are
        asserted by the operator, and IBM does not sign job results, so independent quantum evidence is not available.
        Every receipt says so explicitly with <code className="font-mono text-xs">quantum_evidence: none</code>.
      </p>
    ),
  },
  {
    q: "Why can't I buy a plan yet?",
    a: (
      <p>
        Paid checkout is not built, and commercial terms with the entropy providers are still being confirmed. The
        plans are proposals, and prices and limits may change before anything is sold. The Free limits are what the
        service enforces today.
      </p>
    ),
  },
  {
    q: "Can I use draws for regulated gambling?",
    a: (
      <p>
        No. QuantumPass holds no gambling certification, and the receipt log is server-operated rather than externally
        anchored. It suits informal draws and credential issuance, not games of chance that a regulator oversees.
      </p>
    ),
  },
];

export function PricingFaq() {
  return (
    <Block id="faq" eyebrow="Questions" title="Straight answers"
           description="The honest versions of the questions people ask before trusting a randomness service.">
      <Faq items={ITEMS} />
    </Block>
  );
}
