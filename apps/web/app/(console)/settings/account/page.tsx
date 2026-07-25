import { PageShell } from "@/components/page-shell"
import { ProfileForm } from "@/features/account/profile-form.public"
import { SecurityMethodsPanel } from "@/features/account/security-methods-panel.public"
import { SessionsPanel } from "@/features/account/sessions-panel.public"
import { getConsoleContext } from "@/lib/server/console-context"

export default async function AccountSettingsPage() {
  const { me } = await getConsoleContext()

  return (
    <PageShell
      title="Account settings"
      description="Manage your profile and active sessions from one place."
    >
      <div className="grid min-w-0 gap-6">
        <ProfileForm user={me.user} />
        <SecurityMethodsPanel />
        <SessionsPanel />
      </div>
    </PageShell>
  )
}
