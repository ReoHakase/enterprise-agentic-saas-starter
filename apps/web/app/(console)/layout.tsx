import type { ReactNode } from "react"
import { Suspense } from "react"

import { ConsoleShellSkeleton } from "@/components/console-boundary"
import { ConsoleShell } from "@/components/console-shell"
import { getConsoleContext } from "@/lib/server/console-context"

const consoleShellFallback = <ConsoleShellSkeleton />

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={consoleShellFallback}>
      <ConsoleLayoutContext>{children}</ConsoleLayoutContext>
    </Suspense>
  )
}

const ConsoleLayoutContext = async ({ children }: { children: ReactNode }) => {
  const { me } = await getConsoleContext()

  return <ConsoleShell me={me}>{children}</ConsoleShell>
}
