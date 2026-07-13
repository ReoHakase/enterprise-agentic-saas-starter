import { OrganizationsPanel } from "@/components/console/forms"
import { PageShell } from "@/components/page-shell"
import { getConsoleContext } from "@/lib/server/console-context"

export default async function OrganizationSettingsListPage() {
  const { me } = await getConsoleContext()

  return (
    <PageShell
      title="Organizations"
      description="Switch between organizations attached to your account."
    >
      <OrganizationsPanel organizations={me.organizations} />
    </PageShell>
  )
}
