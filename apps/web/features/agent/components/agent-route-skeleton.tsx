import { Skeleton } from "@enterprise-agentic-saas/ui/components/skeleton"

import { PageShell } from "@/components/page-shell"

export const AgentRouteSkeleton = () => (
  <PageShell
    title="Agent"
    description="Loading the organization Agent…"
    boundaryState="loading"
  >
    <Skeleton className="min-h-136 w-full rounded-xl" />
  </PageShell>
)
