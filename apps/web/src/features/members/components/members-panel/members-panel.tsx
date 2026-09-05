"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { useCallback, useState } from "react"
import { toast } from "sonner"

import {
  isStepUpRequiredError,
  showConsoleApiErrorToast,
  consoleKeys,
} from "@/features/console"
import type {
  OrganizationDetail,
  OrganizationRole,
} from "@/features/organizations"
import { browserConsoleApi } from "@/lib/browser/console-api"
import { clientEnv } from "@/lib/env"

import { sendOrganizationInvitation } from "../../api"
import type {
  InvitationInput,
  OrganizationInvitation,
  OrganizationMember,
} from "../../schema"
import { InvitationsSection } from "../invitations-section/invitations-section"
import { InviteMemberDialog } from "../invite-member-dialog/invite-member-dialog"
import {
  MemberConfirmationDialog,
  StepUpDialog,
  type StepUpRequest,
} from "../member-confirmation-dialog/member-confirmation-dialog"
import { MembersTable } from "../members-table/members-table"

type MemberMutationInput =
  | {
      type: "role"
      memberId: string
      role: Exclude<OrganizationRole, "owner">
    }
  | { type: "transfer"; memberId: string; confirmation: string }
  | { type: "invite"; email: string; role: "admin" | "member" }
  | { type: "remove"; memberId: string; confirmation: string }
  | { type: "cancel-invitation"; invitationId: string }
  | {
      type: "resend-invitation"
      email: string
      role: "admin" | "member"
    }

type MemberMutationOutcome =
  | { type: "invite" }
  | {
      type: "role" | "transfer" | "remove" | "cancel-invitation"
    }
  | { type: "resend-invitation" }

type MembersPanelProps = {
  organization: OrganizationDetail
  members: OrganizationMember[]
  invitations: OrganizationInvitation[]
  invitationsPending?: boolean
  invitationsError?: string
  onRetryInvitations?: () => void
}

const runMemberMutation = async (
  organizationId: string,
  input: MemberMutationInput
): Promise<MemberMutationOutcome> => {
  if (input.type === "role") {
    await browserConsoleApi.updateMemberRole(
      organizationId,
      input.memberId,
      input.role
    )
    return { type: "role" }
  }
  if (input.type === "transfer") {
    await browserConsoleApi.transferOwnership(organizationId, {
      memberId: input.memberId,
      confirmation: input.confirmation,
    })
    return { type: "transfer" }
  }
  if (input.type === "invite") {
    await sendOrganizationInvitation({
      apiBaseUrl: clientEnv.VITE_API_BASE_URL,
      email: input.email,
      organizationId,
      role: input.role,
    })
    return { type: "invite" }
  }
  if (input.type === "remove") {
    await browserConsoleApi.removeMember(
      organizationId,
      input.memberId,
      input.confirmation
    )
    return { type: "remove" }
  }
  if (input.type === "resend-invitation") {
    await sendOrganizationInvitation({
      apiBaseUrl: clientEnv.VITE_API_BASE_URL,
      email: input.email,
      organizationId,
      resend: true,
      role: input.role,
    })
    return { type: "resend-invitation" }
  }
  await browserConsoleApi.cancelInvitation(organizationId, input.invitationId)
  return { type: "cancel-invitation" }
}

const mutationSuccessMessage = (outcome: MemberMutationOutcome) => {
  if (outcome.type === "invite") {
    return "Invitation sent"
  }
  if (outcome.type === "cancel-invitation") {
    return "Invitation canceled"
  }
  if (outcome.type === "resend-invitation") {
    return "Invitation resent"
  }
  if (outcome.type === "remove") {
    return "Member removed"
  }
  if (outcome.type === "transfer") {
    return "Ownership transferred"
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
  const [pendingOwnershipTransfer, setPendingOwnershipTransfer] =
    useState<OrganizationMember | null>(null)
  const [pendingMemberRemoval, setPendingMemberRemoval] =
    useState<OrganizationMember | null>(null)
  const [stepUpRequest, setStepUpRequest] = useState<StepUpRequest | null>(null)
  const canInvite = organization.permissions.canInviteMembers
  const canManageMembers = organization.permissions.canManageMembers
  const canManageRoles = organization.permissions.canManageAdmins
  const canTransferOwnership = organization.permissions.canTransferOwnership
  const mutationFn = useCallback(
    (input: MemberMutationInput) => runMemberMutation(organization.id, input),
    [organization.id]
  )
  const handleMutationError = useCallback(
    (error: unknown, input: MemberMutationInput) => {
      if (isStepUpRequiredError(error)) {
        setStepUpRequest({})
        return
      }

      if (
        input.type !== "invite" &&
        input.type !== "remove" &&
        input.type !== "transfer"
      ) {
        const fallback =
          input.type === "resend-invitation"
            ? "The invitation could not be resent."
            : input.type === "cancel-invitation"
              ? "The invitation could not be canceled."
              : "The member update failed."
        showConsoleApiErrorToast(error, fallback)
      }
    },
    []
  )
  const handleMutationSuccess = useCallback(
    async (outcome: MemberMutationOutcome) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: consoleKeys.members(organization.id),
        }),
        queryClient.invalidateQueries({
          queryKey: consoleKeys.invitations(organization.id),
        }),
      ])
      void router.invalidate()
      toast.success(mutationSuccessMessage(outcome))
    },
    [organization.id, queryClient, router]
  )
  // success callbackでmemberとinvitationのquery familyをinvalidateする。
  // oxlint-disable-next-line react-doctor/query-mutation-missing-invalidation
  const memberMutation = useMutation<
    MemberMutationOutcome,
    unknown,
    MemberMutationInput
  >({
    mutationFn,
    onError: handleMutationError,
    onSuccess: handleMutationSuccess,
  })
  const {
    isPending: mutationPending,
    mutate: mutateMember,
    mutateAsync: mutateMemberAsync,
    variables: mutationVariables,
  } = memberMutation
  const inviteMember = useCallback(
    (value: InvitationInput) => mutateMemberAsync({ type: "invite", ...value }),
    [mutateMemberAsync]
  )
  const confirmOwnershipTransfer = useCallback(
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
  const resendInvitation = useCallback(
    (invitation: OrganizationInvitation) =>
      mutateMember({
        type: "resend-invitation",
        email: invitation.email,
        role: invitation.role,
      }),
    [mutateMember]
  )
  const busyInvitationId =
    mutationPending &&
    (mutationVariables?.type === "cancel-invitation" ||
      mutationVariables?.type === "resend-invitation")
      ? mutationVariables.type === "cancel-invitation"
        ? mutationVariables.invitationId
        : invitations.find(
            (invitation) => invitation.email === mutationVariables.email
          )?.id
      : undefined
  const requestMemberRemoval = useCallback(
    (member: OrganizationMember) => setPendingMemberRemoval(member),
    []
  )
  const closeMemberRemoval = useCallback(
    () => setPendingMemberRemoval(null),
    []
  )
  const closeOwnershipTransfer = useCallback(
    () => setPendingOwnershipTransfer(null),
    []
  )
  const closeStepUp = useCallback(() => setStepUpRequest(null), [])
  const changeRole = useCallback(
    (member: OrganizationMember, nextRole: OrganizationRole) => {
      if (nextRole === member.role) {
        return
      }
      if (nextRole === "owner") {
        setPendingOwnershipTransfer(member)
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
            Only the Owner can change organization roles.
          </p>
        ) : null}
        <MembersTable
          organizationName={organization.name}
          organizationRole={organization.role}
          members={members}
          pending={mutationPending}
          canManageMembers={canManageMembers}
          canManageRoles={canManageRoles}
          canTransferOwnership={canTransferOwnership}
          onChangeRole={changeRole}
          onRequestRemove={requestMemberRemoval}
        />
      </section>

      {canInvite ? (
        <InvitationsSection
          organizationName={organization.name}
          invitations={invitations}
          pending={invitationsPending}
          error={invitationsError}
          canCancel={canManageMembers}
          canResend={canManageMembers}
          canResendAdmins={canManageRoles}
          mutationPending={mutationPending}
          busyInvitationId={busyInvitationId}
          onCancel={cancelInvitation}
          onResend={resendInvitation}
          onRetry={onRetryInvitations}
        />
      ) : null}

      {pendingOwnershipTransfer ? (
        <MemberConfirmationDialog
          key={`transfer-${pendingOwnershipTransfer.id}`}
          action="transfer"
          member={pendingOwnershipTransfer}
          pending={mutationPending}
          onClose={closeOwnershipTransfer}
          onConfirm={confirmOwnershipTransfer}
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
