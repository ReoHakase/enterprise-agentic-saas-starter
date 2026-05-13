import { redirect } from "next/navigation"

import { verifySession } from "@/lib/server/auth"

export default async function OnboardingPage() {
  await verifySession()
  redirect("/settings/organizations")
}
