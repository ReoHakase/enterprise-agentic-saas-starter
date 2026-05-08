import { Auth } from "@/components/auth/auth"
import { InvitationDecisionPanel } from "@/components/console/forms"
import { verifySession } from "@/lib/server/auth"

type InvitationPageProps = {
  params: Promise<{ invitationId: string }>
}

export default async function InvitationPage({ params }: InvitationPageProps) {
  const { invitationId } = await params
  const session = await verifySession().catch(() => null)

  if (!session) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <Auth className="w-full max-w-sm" path="sign-in" />
      </main>
    )
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <InvitationDecisionPanel invitationId={invitationId} />
    </main>
  )
}
