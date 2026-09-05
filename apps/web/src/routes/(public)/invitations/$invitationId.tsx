import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { setResponseHeader } from "@tanstack/react-start/server"

import { InvitationRouteFrame } from "@/components/public-route-frame/public-route-frame"
import { InvitationRouteLoading } from "@/components/public-route-suspense/public-route-suspense"
import {
  getInvitationContext,
  InvitationDecisionPanel,
} from "@/features/members"
import { serverEnv } from "@/lib/env.server"
import { getCookieHeader, getSession } from "@/lib/server/auth"

import { InvitationRouteError } from "../-route-boundaries"

const loadInvitation = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    if (
      typeof input !== "string" ||
      input.length === 0 ||
      input.length > 4_096
    ) {
      throw new Error("Invalid invitation identifier")
    }
    return input
  })
  .handler(async ({ data: invitationId }) => {
    setResponseHeader("Cache-Control", "no-store")
    const session = await getSession()

    if (!session) return { invitationId, state: "signed_out" as const }

    const invitationContext = await getInvitationContext({
      apiBaseUrl: serverEnv.API_PUBLIC_URL,
      cookie: await getCookieHeader(),
      invitationId,
    })

    if (invitationContext.kind === "signed_out") {
      return { invitationId, state: "signed_out" as const }
    }

    const currentUser = {
      currentUserEmail: session.user.email,
      currentUserId: session.user.id,
      currentUserProfileImage: session.user.image ?? null,
      currentUserName: session.user.name?.trim() || session.user.email,
    }

    if (invitationContext.kind === "ready") {
      return {
        ...currentUser,
        invitation: invitationContext.invitation,
        invitationId,
        state: "ready" as const,
      }
    }

    return {
      ...currentUser,
      invitationId,
      state: invitationContext.kind,
    }
  })

const InvitationPage = () => {
  const invitation = Route.useLoaderData()

  return (
    <InvitationRouteFrame>
      <InvitationDecisionPanel {...invitation} />
    </InvitationRouteFrame>
  )
}

export const Route = createFileRoute("/(public)/invitations/$invitationId")({
  loader: ({ params }) => loadInvitation({ data: params.invitationId }),
  component: InvitationPage,
  errorComponent: InvitationRouteError,
  pendingComponent: InvitationRouteLoading,
})
