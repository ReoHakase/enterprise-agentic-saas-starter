import { ConsolePage } from "@/components/console/console-page"
import { SessionsPanel } from "@/components/console/forms"
import { PageShell } from "@/components/page-shell"
import { verifySession } from "@/lib/server/auth"
import { createServerConsoleApi } from "@/lib/server/console-api"

export default async function SessionSettingsPage() {
  await verifySession()
  const api = await createServerConsoleApi()
  const sessions = await api.listSessions()

  return (
    <ConsolePage requireOrganization={false}>
      <PageShell
        title="Sessions"
        description="Review and revoke active sessions."
      >
        <SessionsPanel sessions={sessions} />
      </PageShell>
    </ConsolePage>
  )
}
