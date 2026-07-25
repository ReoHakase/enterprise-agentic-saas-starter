import { OrganizationsPage } from "@/features/organizations/organizations-page.public"
import { getConsoleContext } from "@/lib/server/console-context"

export default async function OrganizationSettingsListPage() {
  const { me } = await getConsoleContext()

  return <OrganizationsPage initialOrganizations={me.organizations} />
}
