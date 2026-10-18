export default function Developers() { return <article className="mx-auto max-w-3xl space-y-5">
  <h1 className="text-3xl font-bold">QuantumPass Evidence API</h1>
  <p>Existing FastAPI endpoints remain stable during the V2.1 Next.js migration.</p>
  <pre className="glass overflow-auto p-6 text-sm">GET /api/v2/password?length=24&amp;receipt=true{"\n"}GET /.well-known/quantumpass-keys.json{"\n"}POST /api/v2/receipts/verify{"\n"}POST /api/v2/draws{"\n"}POST /api/v2/draws/{'{id}'}/run</pre>
  <p>For independent verification, export the receipt and public keys and use the offline Python verifier. A valid receipt does not independently attest the QPU output.</p>
</article>; }
