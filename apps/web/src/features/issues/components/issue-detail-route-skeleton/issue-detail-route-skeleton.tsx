import { Skeleton } from "@enterprise-agentic-saas/ui/components/skeleton"

export const IssueDetailRouteSkeleton = () => (
  <section
    data-route-boundary="true"
    data-boundary-state="loading"
    className="flex min-h-full flex-col gap-6"
    aria-busy="true"
    aria-label="Loading issue details"
    role="status"
  >
    <div className="flex min-w-0 items-center gap-2 pr-12" aria-hidden="true">
      <Skeleton className="h-8 max-w-xl min-w-20 flex-1 sm:w-72 sm:flex-none" />
      <Skeleton className="h-5 w-10 shrink-0" />
      <Skeleton className="size-8 shrink-0 rounded-lg" />
      <Skeleton className="ml-auto h-8 w-24 shrink-0 rounded-lg" />
    </div>

    <div
      className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-8"
      aria-hidden="true"
    >
      <aside className="order-1 flex min-w-0 flex-col gap-5 border-t pt-6 lg:sticky lg:top-6 lg:order-2 lg:col-start-2 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-4 w-40" />
        </div>
        {Array.from({ length: 5 }, (_, index) => (
          <div className="flex flex-col gap-2" key={index}>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        ))}
      </aside>

      <div className="order-2 flex min-w-0 flex-col gap-6 lg:order-1 lg:col-start-1">
        <section className="min-w-0">
          <div className="overflow-hidden rounded-xl border">
            <div className="flex items-center justify-between gap-3 bg-muted/40 px-4 py-3">
              <div className="flex min-w-0 flex-col gap-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
              <Skeleton className="size-8 shrink-0 rounded-lg" />
            </div>
            <div className="flex flex-col gap-3 border-t p-4">
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
          <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-5">
            {Array.from({ length: 3 }, (_, index) => (
              <div className="contents" key={index}>
                <Skeleton className="size-8 rounded-full" />
                <div className="flex min-w-0 flex-col gap-2 pt-1">
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              </div>
            ))}
          </div>
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-9 w-28 self-end" />
        </section>
      </div>
    </div>
  </section>
)
