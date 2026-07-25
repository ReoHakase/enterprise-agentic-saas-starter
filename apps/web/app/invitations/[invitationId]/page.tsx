import { InvitationRouteFrame } from "@/components/public-route-frame"
import { getInvitationContext } from "@/features/members/api.public"
import { InvitationDecisionPanel } from "@/features/members/invitation-panel.public"
import { serverEnv } from "@/lib/env.server"
import { getCookieHeader, getSession } from "@/lib/server/auth"

type InvitationPageProps = {
  params: Promise<{ invitationId: string }>
}

export default async function InvitationPage({ params }: InvitationPageProps) {
  const [{ invitationId }, session] = await Promise.all([params, getSession()])

  if (!session) {
    return (
      <InvitationRouteFrame>
        <InvitationDecisionPanel
          invitationId={invitationId}
          state="signed_out"
        />
      </InvitationRouteFrame>
    )
  }

  const invitationContext = await getInvitationContext({
    apiBaseUrl: serverEnv.API_PUBLIC_URL,
    cookie: await getCookieHeader(),
    invitationId,
  })

  if (invitationContext.kind === "signed_out") {
    return (
      <InvitationRouteFrame>
        <InvitationDecisionPanel
          invitationId={invitationId}
          state="signed_out"
        />
      </InvitationRouteFrame>
    )
  }

  const currentUserName = session.user.name?.trim() || session.user.email

  return (
    <InvitationRouteFrame>
      {invitationContext.kind === "ready" ? (
        <InvitationDecisionPanel
          currentUserEmail={session.user.email}
          currentUserId={session.user.id}
          currentUserProfileImage={session.user.image ?? null}
          currentUserName={currentUserName}
          invitation={invitationContext.invitation}
          invitationId={invitationId}
          state="ready"
        />
      ) : (
        <InvitationDecisionPanel
          currentUserEmail={session.user.email}
          currentUserId={session.user.id}
          currentUserProfileImage={session.user.image ?? null}
          currentUserName={currentUserName}
          invitationId={invitationId}
          state={
            invitationContext.kind === "recipient_mismatch"
              ? "recipient_mismatch"
              : invitationContext.kind
          }
        />
      )}
    </InvitationRouteFrame>
  )
}
