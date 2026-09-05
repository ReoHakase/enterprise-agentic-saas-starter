import { createFileRoute, redirect } from "@tanstack/react-router"

import { OnboardingRouteSkeleton } from "@/features/console"

export const Route = createFileRoute("/_console/onboarding")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/organizations" })
  },
  pendingComponent: OnboardingRouteSkeleton,
  pendingMs: 0,
})
