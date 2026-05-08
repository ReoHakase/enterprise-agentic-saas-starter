import { redirect } from "next/navigation"
import type { ReactNode } from "react"

import { ConsoleShell } from "@/components/console-shell"
import { verifySession } from "@/lib/server/auth"
import { createServerConsoleApi } from "@/lib/server/console-api"

export const ConsolePage = async ({
  children,
  requireOrganization = true,
}: {
  children: ReactNode
  requireOrganization?: boolean
}) => {
  await verifySession()
  const api = await createServerConsoleApi()
  const me = await api.getMe()

  if (requireOrganization && me.organizations.length === 0) {
    redirect("/onboarding")
  }

  return <ConsoleShell me={me}>{children}</ConsoleShell>
}
