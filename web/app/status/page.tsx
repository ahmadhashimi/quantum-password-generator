import { SourcesPanel } from "../../components/SourcesPanel";
export const dynamic = "force-dynamic";
export default function Status() { return <div className="mx-auto max-w-2xl space-y-4">
  <h1 className="text-3xl font-bold">Entropy source status</h1>
  <p className="text-sm text-slate-500">Availability is live telemetry, not evidence of a source's contribution to a past receipt.</p>
  <SourcesPanel/>
</div>; }
