"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { MailCheckIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback } from "react"
import { toast } from "sonner"

import { consoleKeys } from "@/features/console/queries"
import { decideInvitation } from "@/features/members/api"
import { clientEnv } from "@/lib/env.client"

export const InvitationDecisionPanel = ({
  invitationId,
}: {
  invitationId: string
}) => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (action: "accept" | "reject") =>
      decideInvitation({
        action,
        apiBaseUrl: clientEnv.NEXT_PUBLIC_API_BASE_URL,
        invitationId,
      }),
    onSuccess: async (_, action) => {
      await queryClient.invalidateQueries({ queryKey: consoleKeys.all })
      toast.success(
        action === "accept" ? "Invitation accepted" : "Invitation rejected"
      )
      router.replace(
        action === "accept" ? "/dashboard" : "/settings/organizations"
      )
      router.refresh()
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Invitation could not be updated"
      )
    },
  })
  const { isPending, mutate } = mutation
  const rejectInvitation = useCallback(() => mutate("reject"), [mutate])
  const acceptInvitation = useCallback(() => mutate("accept"), [mutate])

  return (
    <section
      data-slot="invitation-panel"
      className="flex w-full max-w-md flex-col gap-5 rounded-2xl border p-5"
    >
      <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <MailCheckIcon aria-hidden="true" />
      </div>
      <div>
        <h1 className="text-xl font-semibold">Organization invitation</h1>
        <p className="text-sm text-muted-foreground">
          Accept to add this organization to your account, or reject to leave
          your memberships unchanged.
        </p>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          disabled={isPending}
          onClick={rejectInvitation}
        >
          Reject
        </Button>
        <Button disabled={isPending} onClick={acceptInvitation}>
          {isPending ? <Spinner data-icon="inline-start" /> : null}
          Accept invitation
        </Button>
      </div>
    </section>
  )
}
