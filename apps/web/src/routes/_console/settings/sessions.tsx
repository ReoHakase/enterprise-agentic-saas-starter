import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_console/settings/sessions")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/account" })
  },
})
