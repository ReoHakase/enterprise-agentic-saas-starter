import type { ReactNode } from "react"

import { ConsoleShell } from "@/components/console-shell"
import { getConsoleContext } from "@/lib/server/console-context"

export default async function ConsoleLayout({
  children,
}: {
  children: ReactNode
}) {
  const { me } = await getConsoleContext()

  return <ConsoleShell me={me}>{children}</ConsoleShell>
}
