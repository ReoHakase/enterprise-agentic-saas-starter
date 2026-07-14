import { redirect } from "next/navigation"

import { InvitationRouteFrame } from "@/components/public-route-frame"
import { InvitationDecisionPanel } from "@/features/members/components/invitation-decision-panel"
import { getSession } from "@/lib/server/auth"

type InvitationPageProps = {
  params: Promise<{ invitationId: string }>
}

export default async function InvitationPage({ params }: InvitationPageProps) {
  const { invitationId } = await params
  const session = await getSession()

  if (!session) {
    redirect(
      `/auth/sign-in?redirectTo=${encodeURIComponent(`/organization/invitations/${invitationId}`)}`
    )
  }

  return (
    <InvitationRouteFrame>
      <InvitationDecisionPanel invitationId={invitationId} />
    </InvitationRouteFrame>
  )
}
