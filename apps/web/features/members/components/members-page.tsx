"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@enterprise-agentic-saas/ui/components/empty"
import { useQuery } from "@tanstack/react-query"
import { RefreshCwIcon, UsersRoundIcon } from "lucide-react"
import { useCallback } from "react"

import { getConsoleApiErrorText } from "@/features/console/error"
import {
  invitationsQueryOptions,
  membersQueryOptions,
} from "@/features/console/queries"
import { MembersPanel } from "@/features/members/components/members-panel"
import type {
  OrganizationInvitation,
  OrganizationMember,
} from "@/features/members/schema"
import type { OrganizationDetail } from "@/features/organizations/schema"

const noInvitations: OrganizationInvitation[] = []

export const MembersPage = ({
  organization,
  initialMembers,
  initialInvitations,
  initialInvitationsError,
}: {
  organization: OrganizationDetail
  initialMembers: OrganizationMember[]
  initialInvitations?: OrganizationInvitation[]
  initialInvitationsError?: string
}) => {
  const membersQuery = useQuery({
    ...membersQueryOptions(organization.id),
    initialData: initialMembers,
  })
  const invitationsQuery = useQuery({
    ...invitationsQueryOptions(
      organization.id,
      organization.permissions.canInviteMembers
    ),
    initialData: initialInvitations,
  })
  const { refetch: refetchMembers } = membersQuery
  const { refetch: refetchInvitations } = invitationsQuery
  const retryMembers = useCallback(() => {
    void refetchMembers()
  }, [refetchMembers])
  const retryInvitations = useCallback(() => {
    void refetchInvitations()
  }, [refetchInvitations])

  if (membersQuery.isError) {
    return (
      <Empty className="border" role="alert">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersRoundIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Members could not be loaded</EmptyTitle>
          <EmptyDescription>
            {getConsoleApiErrorText(
              membersQuery.error,
              "Try the request again."
            )}
          </EmptyDescription>
          <Button variant="outline" onClick={retryMembers}>
            <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
            Try again
          </Button>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <MembersPanel
      organization={organization}
      members={membersQuery.data}
      invitations={invitationsQuery.data ?? noInvitations}
      invitationsPending={
        organization.permissions.canInviteMembers &&
        invitationsQuery.isPending &&
        !initialInvitationsError
      }
      invitationsError={
        invitationsQuery.isSuccess
          ? undefined
          : invitationsQuery.error
            ? getConsoleApiErrorText(
                invitationsQuery.error,
                "Invitations could not be loaded."
              )
            : initialInvitationsError
      }
      onRetryInvitations={
        organization.permissions.canInviteMembers ? retryInvitations : undefined
      }
    />
  )
}
