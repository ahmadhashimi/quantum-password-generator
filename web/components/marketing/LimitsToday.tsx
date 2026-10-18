import type { ReactNode } from "react";

import { Stat } from "@/components/ui";

import { Block } from "./Block";

function Per({ n, unit }: { n: ReactNode; unit: string }) {
  return (
    <>
      {n} <span className="text-sm font-normal text-muted">{unit}</span>
    </>
  );
}

/** Mirrors the quotas the backend enforces (backend/app/ratelimit.py, config.py and GET /api/v2/me/usage). */
export function LimitsToday() {
  return (
    <Block id="limits" eyebrow="Today" title="The limits the service enforces now"
           description={"These come from the running service, not from a plan. The proposed plans below change " +
                        "limits and features, never what a receipt means."}>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <li>
          <Stat label="Signed draws" value={<Per n={50} unit="per day" />}
                hint="Signed-in accounts, up to 10,000 entries and 100 winners per draw." />
        </li>
        <li>
          <Stat label="IBM-pool seeds" value={<Per n={20} unit="per day" />}
                hint="Signed-in accounts. Labelled per result and subject to availability." />
        </li>
        <li>
          <Stat label="Assistant" value={<Per n={50} unit="messages per day" />}
                hint="Also bounded by a $1.00 daily spend cap. It can be switched off." />
        </li>
        <li>
          <Stat label="Request rate" value={<Per n={120} unit="per minute" />}
                hint="Signed in. Anonymous callers get 30 per minute." />
        </li>
      </ul>
    </Block>
  );
}
