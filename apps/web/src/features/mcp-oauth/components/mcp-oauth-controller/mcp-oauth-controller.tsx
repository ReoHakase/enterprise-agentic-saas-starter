"use client"

import { useAuth } from "@better-auth-ui/react"
import { useMutation } from "@tanstack/react-query"
import { useCallback } from "react"
import { toast } from "sonner"

import type { Me } from "@/features/account"
import { browserConsoleApi } from "@/lib/browser/console-api"

import { continueMcpOAuth, decideMcpOAuthConsent } from "../../client"
import type { McpOAuthGrantedScope, McpOAuthScopeSummary } from "../../query"
import {
  McpOAuthConsentView,
  type McpOAuthOrganizationOption,
  McpOAuthOrganizationView,
} from "../mcp-oauth-authorization/mcp-oauth-authorization"

export const McpOAuthOrganizationController = ({
  addAccountHref,
  currentUser,
  organizations,
  returnTo,
}: {
  addAccountHref: string
  currentUser: Me["user"]
  organizations: readonly McpOAuthOrganizationOption[]
  returnTo: string
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
      addAccountHref={addAccountHref}
      currentUser={currentUser}
      organizations={organizations}
      pendingOrganizationId={
        mutation.isPending ? mutation.variables : undefined
      }
      returnTo={returnTo}
      onSelect={mutation.mutate}
    />
  )
}

export const McpOAuthConsentController = ({
  addAccountHref,
  currentUser,
  organization,
  returnTo,
  scopes,
}: {
  addAccountHref: string
  currentUser: Me["user"]
  organization?: McpOAuthOrganizationOption
  returnTo: string
  scopes: readonly McpOAuthScopeSummary[] | null
}) => {
  const { authClient } = useAuth()
  const { isPending, mutate } = useMutation({
    mutationFn: (input: {
      accept: boolean
      scopes?: readonly McpOAuthGrantedScope[]
    }) =>
      decideMcpOAuthConsent(authClient, {
        accept: input.accept,
        scopes: input.scopes ?? [],
      }),
    onError: () => {
      toast.error("Could not complete authorization. Try again.")
    },
  })
  const handleDecision = useCallback(
    (accept: boolean, grantedScopes?: readonly McpOAuthGrantedScope[]) => {
      mutate({ accept, scopes: grantedScopes })
    },
    [mutate]
  )

  return (
    <McpOAuthConsentView
      addAccountHref={addAccountHref}
      currentUser={currentUser}
      organization={organization}
      pending={isPending}
      returnTo={returnTo}
      scopes={scopes}
      onDecision={handleDecision}
    />
  )
}
