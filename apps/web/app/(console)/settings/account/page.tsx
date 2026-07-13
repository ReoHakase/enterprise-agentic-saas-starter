import {
  ProfileForm,
  SecurityMethodsPanel,
  SessionsPanel,
} from "@/components/console/forms"
import { PageShell } from "@/components/page-shell"
import { createServerConsoleApi } from "@/lib/server/console-api"
import { getConsoleContext } from "@/lib/server/console-context"

export default async function AccountSettingsPage() {
  const [{ me }, sessions] = await Promise.all([
    getConsoleContext(),
    createServerConsoleApi().then((api) => api.listSessions()),
  ])

  return (
    <PageShell
      title="Account settings"
      description="Manage your profile and active sessions from one place."
    >
      <div className="grid min-w-0 gap-6">
        <ProfileForm user={me.user} />
        <SecurityMethodsPanel />
        <SessionsPanel sessions={sessions} />
      </div>
    </PageShell>
  )
}
