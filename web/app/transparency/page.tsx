export default function Transparency() { return <article className="mx-auto max-w-3xl space-y-5">
  <h1 className="text-3xl font-bold">What QuantumPass can prove</h1>
  <p>**Signature integrity:** both Ed25519 and ML-DSA-65 signatures authenticate an operator-issued statement when verified against an independently trusted key.</p>
  <p>**Entropy provenance:** IBM job IDs, QRNG sources and health assessments are reported by QuantumPass. They do not establish an independently authenticated quantum origin.</p>
  <p>**Current limit:** the server-controlled receipt log and local hash chain are not an externally anchored transparency log. An operator can withhold or replace records.</p>
  <p>**Fair draws:** selection is deterministically reproducible from a disclosed seed and canonical entry list. Commit-then-run does not stop a malicious operator from suppressing results.</p>
  <a href="/verify" className="btn-primary">Inspect a receipt</a>
</article>; }
