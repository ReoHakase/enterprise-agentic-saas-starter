import { ConsolePage } from "@/components/console/console-page"
import { ProfileForm } from "@/components/console/forms"
import { PageShell } from "@/components/page-shell"
import { verifySession } from "@/lib/server/auth"
import { createServerConsoleApi } from "@/lib/server/console-api"

export default async function ProfileSettingsPage() {
  await verifySession()
  const api = await createServerConsoleApi()
  const me = await api.getMe()

  return (
    <ConsolePage requireOrganization={false}>
      <PageShell title="Profile" description="Update your user settings.">
        <ProfileForm user={me.user} />
      </PageShell>
    </ConsolePage>
  )
}
