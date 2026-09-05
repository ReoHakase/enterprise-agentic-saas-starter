import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_console/settings/profile")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/account" })
  },
})
