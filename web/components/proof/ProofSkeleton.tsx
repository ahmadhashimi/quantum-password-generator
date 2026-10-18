import { Card, CardBody, Skeleton } from "@/components/ui";

/** Placeholder shaped like the report while the receipt and the key set load. */
export function ProofSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <Card>
        <CardBody className="space-y-6">
          <div className="flex items-start gap-4">
            <Skeleton className="size-14 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2.5">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </CardBody>
      </Card>
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardBody className="space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full max-w-lg" />
            <Skeleton className="h-16 w-full" />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
