import type { ReactNode } from "react"

import { IssueModalRouteShell } from "@/features/issues"

export default function IssueModalLayout({
  children,
}: {
  children: ReactNode
}) {
  return <IssueModalRouteShell>{children}</IssueModalRouteShell>
}
