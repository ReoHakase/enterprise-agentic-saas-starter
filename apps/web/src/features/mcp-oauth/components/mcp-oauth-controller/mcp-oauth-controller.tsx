"use client"

import { useAuth } from "@better-auth-ui/react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"

import { browserConsoleApi } from "@/lib/browser/console-api"

import { continueMcpOAuth, decideMcpOAuthConsent } from "../../client"
import type { McpOAuthScopeSummary } from "../../query"
import {
  McpOAuthConsentView,
  type McpOAuthOrganizationOption,
  McpOAuthOrganizationView,
} from "../mcp-oauth-authorization/mcp-oauth-authorization"

export const McpOAuthOrganizationController = ({
  organizations,
}: {
  organizations: readonly McpOAuthOrganizationOption[]
}) => {
  const { authClient } = useAuth()
  const mutation = useMutation({
    mutationFn: async (organizationId: string) => {
      await browserConsoleApi.activateOrganization(organizationId)
      await continueMcpOAuth(authClient)
    },
    onError: () => {
      toast.error("Could not select this organization. Try again.")
    },
  })

  return (
    <McpOAuthOrganizationView
      organizations={organizations}
      pendingOrganizationId={
        mutation.isPending ? mutation.variables : undefined
      }
      onSelect={mutation.mutate}
    />
  )
}

export const McpOAuthConsentController = ({
  scopes,
}: {
  scopes: readonly McpOAuthScopeSummary[] | null
}) => {
  const { authClient } = useAuth()
  const mutation = useMutation({
    mutationFn: (accept: boolean) =>
      decideMcpOAuthConsent(authClient, {
        accept,
        scopes: scopes?.map(({ scope }) => scope) ?? [],
      }),
    onError: () => {
      toast.error("Could not complete authorization. Try again.")
    },
  })

  return (
    <McpOAuthConsentView
      pending={mutation.isPending}
      scopes={scopes}
      onDecision={mutation.mutate}
    />
  )
}
