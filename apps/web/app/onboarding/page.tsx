import { redirect } from "next/navigation"

import { OnboardingForm } from "@/components/console/forms"
import { verifySession } from "@/lib/server/auth"
import { createServerConsoleApi } from "@/lib/server/console-api"

export default async function OnboardingPage() {
  await verifySession()
  const api = await createServerConsoleApi()
  const me = await api.getMe()

  if (me.organizations.length > 0) {
    redirect("/dashboard")
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <OnboardingForm />
    </main>
  )
}
