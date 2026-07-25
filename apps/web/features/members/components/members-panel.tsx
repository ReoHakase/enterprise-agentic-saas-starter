"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import { toast } from "sonner"

import { isStepUpRequiredError } from "@/features/console/api.public"
import { showConsoleApiErrorToast } from "@/features/console/error-toast.public"
import { consoleKeys } from "@/features/console/queries.public"
import type {
  OrganizationDetail,
  OrganizationRole,
} from "@/features/organizations/schema.public"
import { browserConsoleApi } from "@/lib/browser/console-api"

import type {
  BulkInvitationInput,
  OrganizationInvitation,
  OrganizationMember,
} from "../schema"
import { InvitationsSection } from "./invitations-section"
import { InviteMemberDialog } from "./invite-member-dialog"
import {
  MemberConfirmationDialog,
  StepUpDialog,
  type StepUpRequest,
} from "./member-confirmation-dialog"
import { MembersTable } from "./members-table"

type MemberMutationInput =
  | {
      type: "role"
      memberId: string
      role: Exclude<OrganizationRole, "super_admin">
    }
  | { type: "transfer"; memberId: string; confirmation: string }
  | { type: "invite"; emails: string[]; role: "admin" | "member" }
  | { type: "remove"; memberId: string; confirmation: string }
  | { type: "cancel-invitation"; invitationId: string }
  | { type: "resend-invitation"; invitationId: string }

type MemberMutationOutcome =
  | { type: "invite"; queuedCount: number }
  | {
      type: "role" | "transfer" | "remove" | "cancel-invitation"
    }
  | { type: "resend-invitation"; revived: boolean }

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
    await browserConsoleApi.transferSuperAdmin(organizationId, {
      memberId: input.memberId,
      confirmation: input.confirmation,
    })
    return { type: "transfer" }
  }
  if (input.type === "invite") {
    const result = await browserConsoleApi.createInvitations(organizationId, {
      emails: input.emails,
      role: input.role,
    })
    return { type: "invite", queuedCount: result.queuedCount }
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
    const result = await browserConsoleApi.resendInvitation(
      organizationId,
      input.invitationId
    )
    return { type: "resend-invitation", revived: result.revived }
  }
  await browserConsoleApi.cancelInvitation(organizationId, input.invitationId)
  return { type: "cancel-invitation" }
}

const mutationSuccessMessage = (outcome: MemberMutationOutcome) => {
  if (outcome.type === "invite") {
    return `${outcome.queuedCount} ${outcome.queuedCount === 1 ? "invitation" : "invitations"} queued`
  }
  if (outcome.type === "cancel-invitation") {
    return "Invitation canceled"
  }
  if (outcome.type === "resend-invitation") {
    return outcome.revived
      ? "Invitation renewed and queued"
      : "Invitation email queued again"
  }
  if (outcome.type === "remove") {
    return "Member removed"
  }
  if (outcome.type === "transfer") {
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
    (error: unknown, input: MemberMutationInput) => {
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
      router.refresh()
      toast.success(mutationSuccessMessage(outcome))
    },
    [organization.id, queryClient, router]
  )
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
    (value: BulkInvitationInput) =>
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
  const resendInvitation = useCallback(
    (invitation: OrganizationInvitation) =>
      mutateMember({
        type: "resend-invitation",
        invitationId: invitation.id,
      }),
    [mutateMember]
  )
  const busyInvitationId =
    mutationPending &&
    (mutationVariables?.type === "cancel-invitation" ||
      mutationVariables?.type === "resend-invitation")
      ? mutationVariables.invitationId
      : undefined
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
