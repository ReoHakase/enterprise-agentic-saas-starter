import { ConsolePage } from "@/components/console/console-page"
import { OrganizationsPanel } from "@/components/console/forms"
import { PageShell } from "@/components/page-shell"
import { verifySession } from "@/lib/server/auth"
import { createServerConsoleApi } from "@/lib/server/console-api"

export default async function OrganizationSettingsListPage() {
  await verifySession()
  const api = await createServerConsoleApi()
  const organizations = await api.listOrganizations()

  return (
    <ConsolePage requireOrganization={false}>
      <PageShell
        title="Organizations"
        description="Switch between organizations attached to your account."
      >
        <OrganizationsPanel organizations={organizations} />
      </PageShell>
    </ConsolePage>
  )
}
