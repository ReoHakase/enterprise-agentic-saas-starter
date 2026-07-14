"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import { toast } from "sonner"

import { isStepUpRequiredError } from "@/features/console/api"
import { consoleKeys } from "@/features/console/queries"
import { InvitationsSection } from "@/features/members/components/invitations-section"
import { InviteMemberDialog } from "@/features/members/components/invite-member-dialog"
import {
  MemberConfirmationDialog,
  StepUpDialog,
  type StepUpRequest,
} from "@/features/members/components/member-confirmation-dialog"
import { MembersTable } from "@/features/members/components/members-table"
import type {
  InvitationFormValues,
  OrganizationInvitation,
  OrganizationMember,
} from "@/features/members/schema"
import type {
  OrganizationDetail,
  OrganizationRole,
} from "@/features/organizations/schema"
import { browserConsoleApi } from "@/lib/browser/console-api"

type MemberMutationInput =
  | {
      type: "role"
      memberId: string
      role: Exclude<OrganizationRole, "super_admin">
    }
  | { type: "transfer"; memberId: string; confirmation: string }
  | { type: "invite"; email: string; role: "admin" | "member" }
  | { type: "remove"; memberId: string; confirmation: string }
  | { type: "cancel-invitation"; invitationId: string }

type MembersPanelProps = {
  organization: OrganizationDetail
  members: OrganizationMember[]
  invitations: OrganizationInvitation[]
  invitationsPending?: boolean
  invitationsError?: string
  onRetryInvitations?: () => void
}

const runMemberMutation = (
  organizationId: string,
  input: MemberMutationInput
) => {
  if (input.type === "role") {
    return browserConsoleApi.updateMemberRole(
      organizationId,
      input.memberId,
      input.role
    )
  }
  if (input.type === "transfer") {
    return browserConsoleApi.transferSuperAdmin(organizationId, {
      memberId: input.memberId,
      confirmation: input.confirmation,
    })
  }
  if (input.type === "invite") {
    return browserConsoleApi.createInvitation(organizationId, {
      email: input.email,
      role: input.role,
    })
  }
  if (input.type === "remove") {
    return browserConsoleApi.removeMember(
      organizationId,
      input.memberId,
      input.confirmation
    )
  }
  return browserConsoleApi.cancelInvitation(organizationId, input.invitationId)
}

const mutationSuccessMessage = (input: MemberMutationInput) => {
  if (input.type === "invite") {
    return "Invitation sent"
  }
  if (input.type === "cancel-invitation") {
    return "Invitation canceled"
  }
  if (input.type === "remove") {
    return "Member removed"
  }
  if (input.type === "transfer") {
    return "Super Admin transferred"
  }
  return "Role updated"
}

export const MembersPanel = ({
  organization,
  members,
  invitations,
  invitationsPending = false,
  invitationsError,
  onRetryInvitations,
}: MembersPanelProps) => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [pendingSuperAdminTransfer, setPendingSuperAdminTransfer] =
    useState<OrganizationMember | null>(null)
  const [pendingMemberRemoval, setPendingMemberRemoval] =
    useState<OrganizationMember | null>(null)
  const [stepUpRequest, setStepUpRequest] = useState<StepUpRequest | null>(null)
  const canInvite = organization.permissions.canInviteMembers
  const canManageMembers = organization.permissions.canManageMembers
  const canManageRoles = organization.permissions.canManageAdmins
  const canTransferSuperAdmin = organization.permissions.canTransferSuperAdmin
  const mutationFn = useCallback(
    (input: MemberMutationInput) => runMemberMutation(organization.id, input),
    [organization.id]
  )
  const handleMutationError = useCallback(
    (error: Error, input: MemberMutationInput) => {
      if (isStepUpRequiredError(error)) {
        setStepUpRequest({
          action:
            typeof error.context.action === "string"
              ? error.context.action
              : undefined,
          maxAgeSeconds:
            typeof error.context.maxAgeSeconds === "number"
              ? error.context.maxAgeSeconds
              : undefined,
        })
        return
      }

      if (
        input.type !== "invite" &&
        input.type !== "remove" &&
        input.type !== "transfer"
      ) {
        toast.error(error.message)
      }
    },
    []
  )
  const handleMutationSuccess = useCallback(
    async (_: unknown, input: MemberMutationInput) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: consoleKeys.members(organization.id),
        }),
        queryClient.invalidateQueries({
          queryKey: consoleKeys.invitations(organization.id),
        }),
      ])
      router.refresh()
      toast.success(mutationSuccessMessage(input))
    },
    [organization.id, queryClient, router]
  )
  const memberMutation = useMutation<unknown, Error, MemberMutationInput>({
    mutationFn,
    onError: handleMutationError,
    onSuccess: handleMutationSuccess,
  })
  const {
    isPending: mutationPending,
    mutate: mutateMember,
    mutateAsync: mutateMemberAsync,
  } = memberMutation
  const inviteMember = useCallback(
    (value: InvitationFormValues) =>
      mutateMemberAsync({ type: "invite", ...value }),
    [mutateMemberAsync]
  )
  const confirmSuperAdminTransfer = useCallback(
    (member: OrganizationMember, confirmation: string) =>
      mutateMemberAsync({
        type: "transfer",
        memberId: member.id,
        confirmation,
      }),
    [mutateMemberAsync]
  )
  const confirmMemberRemoval = useCallback(
    (member: OrganizationMember, confirmation: string) =>
      mutateMemberAsync({
        type: "remove",
        memberId: member.id,
        confirmation,
      }),
    [mutateMemberAsync]
  )
  const cancelInvitation = useCallback(
    (invitationId: string) =>
      mutateMember({ type: "cancel-invitation", invitationId }),
    [mutateMember]
  )
  const requestMemberRemoval = useCallback(
    (member: OrganizationMember) => setPendingMemberRemoval(member),
    []
  )
  const closeMemberRemoval = useCallback(
    () => setPendingMemberRemoval(null),
    []
  )
  const closeSuperAdminTransfer = useCallback(
    () => setPendingSuperAdminTransfer(null),
    []
  )
  const closeStepUp = useCallback(() => setStepUpRequest(null), [])
  const changeRole = useCallback(
    (member: OrganizationMember, nextRole: OrganizationRole) => {
      if (nextRole === member.role) {
        return
      }
      if (nextRole === "super_admin") {
        setPendingSuperAdminTransfer(member)
        return
      }
      mutateMember({ type: "role", memberId: member.id, role: nextRole })
    },
    [mutateMember]
  )

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <section
        className="flex min-w-0 flex-col gap-4"
        aria-labelledby="member-list-heading"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="member-list-heading" className="font-medium">
              Organization members
            </h2>
            <p className="text-sm text-muted-foreground">
              {members.length} {members.length === 1 ? "person" : "people"} can
              access this workspace.
            </p>
          </div>
          {canInvite ? (
            <InviteMemberDialog
              canInviteAdmins={canManageRoles}
              pending={mutationPending}
              onInvite={inviteMember}
            />
          ) : null}
        </div>
        {!canManageRoles ? (
          <p className="text-sm text-muted-foreground">
            Only the Super Admin can change organization roles.
          </p>
        ) : null}
        <MembersTable
          organizationName={organization.name}
          organizationRole={organization.role}
          members={members}
          pending={mutationPending}
          canManageMembers={canManageMembers}
          canManageRoles={canManageRoles}
          canTransferSuperAdmin={canTransferSuperAdmin}
          onChangeRole={changeRole}
          onRequestRemove={requestMemberRemoval}
        />
      </section>

      <InvitationsSection
        invitations={invitations}
        pending={invitationsPending}
        error={invitationsError}
        canCancel={canManageMembers}
        mutationPending={mutationPending}
        onCancel={cancelInvitation}
        onRetry={onRetryInvitations}
      />

      {pendingSuperAdminTransfer ? (
        <MemberConfirmationDialog
          key={`transfer-${pendingSuperAdminTransfer.id}`}
          action="transfer"
          member={pendingSuperAdminTransfer}
          pending={mutationPending}
          onClose={closeSuperAdminTransfer}
          onConfirm={confirmSuperAdminTransfer}
        />
      ) : null}
      {pendingMemberRemoval ? (
        <MemberConfirmationDialog
          key={`remove-${pendingMemberRemoval.id}`}
          action="remove"
          member={pendingMemberRemoval}
          pending={mutationPending}
          onClose={closeMemberRemoval}
          onConfirm={confirmMemberRemoval}
        />
      ) : null}
      <StepUpDialog request={stepUpRequest} onClose={closeStepUp} />
    </div>
  )
}
