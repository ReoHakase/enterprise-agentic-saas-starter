"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Building2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback } from "react"
import { toast } from "sonner"

import { AppState } from "@/components/app-state"
import { showConsoleApiErrorToast } from "@/features/console/error-toast"
import {
  cancelTenantWorkForOrganizationSwitch,
  prepareOrganizationSwitch,
} from "@/features/organizations/cache"
import { browserConsoleApi } from "@/lib/browser/console-api"

export const OrganizationActivationGate = ({
  organizationId,
  organizationName,
}: {
  organizationId: string
  organizationName: string
}) => {
  const queryClient = useQueryClient()
  const router = useRouter()
  const mutation = useMutation({
    mutationFn: async () => {
      await cancelTenantWorkForOrganizationSwitch(queryClient)
      return browserConsoleApi.activateOrganization(organizationId)
    },
    onSuccess: async () => {
      await prepareOrganizationSwitch(queryClient, organizationId)
      toast.success("Organization switched")
      router.refresh()
    },
    onError: (error) => {
      showConsoleApiErrorToast(error, "Could not switch organization")
    },
  })
  const { isPending, mutate } = mutation
  const activate = useCallback(() => mutate(), [mutate])

  return (
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
  )
}
