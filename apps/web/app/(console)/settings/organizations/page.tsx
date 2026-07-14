import { OrganizationsPage } from "@/features/organizations/components/organizations-page"
import { getConsoleContext } from "@/lib/server/console-context"

export default async function OrganizationSettingsListPage() {
  const { me } = await getConsoleContext()

  return <OrganizationsPage initialOrganizations={me.organizations} />
}
