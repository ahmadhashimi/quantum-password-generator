import { ScrollText } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge, Callout, Card, CardBody, CardHeader, Skeleton } from "@/components/ui";
import type { VerifyResult } from "@/lib/api/schemas";

import { linkClass } from "./parts";
import type { Optional } from "./proof-data";

/** Section 6: is this exact receipt in the issuing server's own log? Answered by the server, not by the browser. */
export function LogCard({ server, receiptId }: { server: Optional<VerifyResult>; receiptId: string | null }) {
  let body: ReactNode;
  if (server.status === "loading") {
    body = <Skeleton className="h-16 w-full" />;
  } else if (server.status === "error") {
    body = <Callout tone="neutral" title="Couldn't check">The server&apos;s verifier didn&apos;t answer ({server.message}).</Callout>;
  } else if (server.status === "idle") {
    body = (
      <Callout tone="neutral" title="Not checked">
        This document was verified only in your browser, so the server&apos;s log wasn&apos;t consulted.
        {receiptId && (
          <>
            {" "}
            <Link href={`/verify/${receiptId}`} prefetch={false} className={linkClass}>Look this receipt up by ID</Link>.
          </>
        )}
      </Callout>
    );
  } else if (server.data.in_public_log === true) {
    body = <Callout tone="success" title="Present in the server-operated receipt log">
      The server holds this exact receipt in its log.
    </Callout>;
  } else if (server.data.in_public_log === false) {
    body = <Callout tone="warning" title="Not found in this server's log">
      This server has no record of this exact receipt. It may have been issued elsewhere, or edited.
    </Callout>;
  } else {
    body = <Callout tone="neutral" title="Unknown">The server did not report log status.</Callout>;
  }
  return (
    <Card id="log">
      <CardHeader icon={<ScrollText />} title="Public log"
                  description="Whether the issuing server's own receipt log holds this exact receipt."
                  action={<Badge tone="warning">Server-operated</Badge>} />
      <CardBody className="space-y-3">
        {body}
        <p className="text-xs text-subtle">
          This is not an externally anchored transparency log, and the operator can withhold records. Presence shows the
          server still holds the receipt; absence doesn&apos;t change what the signatures prove.
        </p>
      </CardBody>
    </Card>
  );
}
