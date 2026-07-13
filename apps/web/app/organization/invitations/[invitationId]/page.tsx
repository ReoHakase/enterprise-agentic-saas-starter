import { redirect } from "next/navigation"

import { InvitationDecisionPanel } from "@/components/console/forms"
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
    <main className="flex min-h-svh items-center justify-center p-6">
      <InvitationDecisionPanel invitationId={invitationId} />
    </main>
  )
}
