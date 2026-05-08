import { ConsolePage } from "@/components/console/console-page"
import { ProfileForm, SessionsPanel } from "@/components/console/forms"
import { PageShell } from "@/components/page-shell"
import { verifySession } from "@/lib/server/auth"
import { createServerConsoleApi } from "@/lib/server/console-api"

export default async function AccountSettingsPage() {
  await verifySession()
  const api = await createServerConsoleApi()
  const [me, sessions] = await Promise.all([api.getMe(), api.listSessions()])

  return (
    <ConsolePage requireOrganization={false}>
      <PageShell
        title="Account settings"
        description="Manage your profile and active sessions from one place."
      >
        <div className="grid min-w-0 gap-6">
          <ProfileForm user={me.user} />
          <SessionsPanel sessions={sessions} />
        </div>
      </PageShell>
    </ConsolePage>
  )
}
