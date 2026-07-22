import { Skeleton } from "@enterprise-agentic-saas/ui/components/skeleton"

import { PageShell } from "@/components/page-shell"

export default function AgentLoading() {
  return (
    <PageShell title="Agent" description="Loading the organization Agent…">
      <Skeleton className="min-h-136 w-full rounded-xl" />
    </PageShell>
  )
}
