import type { ReactNode } from "react"

import { IssueModalRouteShell } from "@/features/issues/components/issue-modal-route-shell"

export default function IssueModalLayout({
  children,
}: {
  children: ReactNode
}) {
  return <IssueModalRouteShell>{children}</IssueModalRouteShell>
}
