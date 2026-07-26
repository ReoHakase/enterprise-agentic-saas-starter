import { redirect } from "next/navigation"

import { getConsoleContext } from "@/lib/server/console-context"

export default async function LegacyDashboardPage() {
  const { me } = await getConsoleContext()
  const organization = me.organizations.find((candidate) => candidate.active)

  redirect(
    organization
      ? `/organization/${organization.slug}/dashboard`
      : "/settings/organizations"
  )
}
