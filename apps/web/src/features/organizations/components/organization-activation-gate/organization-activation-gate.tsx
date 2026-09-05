"use client"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@enterprise-agentic-saas/ui/components/alert-dialog"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { Building2Icon } from "lucide-react"
import { useCallback, useState } from "react"
import { toast } from "sonner"

import { AppState } from "@/components/app-state/app-state"
import {
  hasOrganizationSwitchRisks,
  useAgentRuntimeState,
} from "@/features/agent"
import { showConsoleApiErrorToast } from "@/features/console"
import { browserConsoleApi } from "@/lib/browser/console-api"

import { prepareOrganizationSwitch } from "../../cache"

export const OrganizationActivationGate = ({
  organizationId,
  organizationName,
}: {
  organizationId: string
  organizationName: string
}) => {
  const queryClient = useQueryClient()
  const router = useRouter()
  const agentRuntime = useAgentRuntimeState()
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const mutation = useMutation({
    mutationFn: () => browserConsoleApi.activateOrganization(organizationId),
    onSuccess: async () => {
      await agentRuntime.completeOrganizationSwitch()
      await prepareOrganizationSwitch(queryClient, organizationId)
      toast.success("Organization switched")
      void router.invalidate()
    },
    onError: (error) => {
      agentRuntime.cancelOrganizationSwitch()
      showConsoleApiErrorToast(error, "Could not switch organization")
    },
  })
  const { isPending, mutate } = mutation
  const activate = useCallback(() => {
    const risks = agentRuntime.beginOrganizationSwitch()
    if (hasOrganizationSwitchRisks(risks)) {
      setConfirmationOpen(true)
      return
    }
    mutate()
  }, [agentRuntime, mutate])
  const cancelSwitch = useCallback(() => {
    setConfirmationOpen(false)
    agentRuntime.cancelOrganizationSwitch()
  }, [agentRuntime])
  const confirmSwitch = useCallback(() => {
    setConfirmationOpen(false)
    mutate()
  }, [mutate])
  const handleConfirmationOpenChange = useCallback(
    (open: boolean) => {
      if (!open) cancelSwitch()
    },
    [cancelSwitch]
  )

  return (
    <>
      <AppState
        className="min-h-96"
        icon={Building2Icon}
        title={`Switch to ${organizationName}`}
        description="This page belongs to another organization. Switch the active tenant before loading its data."
      >
        <Button onClick={activate} disabled={isPending}>
          {isPending ? <Spinner data-icon="inline-start" /> : null}
          Switch and continue
        </Button>
      </AppState>
      <AlertDialog
        open={confirmationOpen}
        onOpenChange={handleConfirmationOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Discard local Agent work and switch?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Unsent messages, uploads, approvals, and unsaved Issue form fields
              will be cleared after the organization switch succeeds.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelSwitch}>
              Stay here
            </AlertDialogCancel>
            <Button onClick={confirmSwitch}>
              Discard local draft and switch
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
