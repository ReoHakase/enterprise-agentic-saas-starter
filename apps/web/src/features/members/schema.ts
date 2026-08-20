import * as v from "valibot"

import { organizationRoleSchema } from "@/features/organizations/schema"

const organizationMemberSchema = v.object({
  id: v.string(),
  userId: v.string(),
  name: v.string(),
  email: v.pipe(v.string(), v.email()),
  profileImage: v.nullable(v.string()),
  githubLinked: v.boolean(),
  passkeyLinked: v.boolean(),
  role: organizationRoleSchema,
  createdAt: v.string(),
})

const organizationInvitationStatusSchema = v.picklist([
  "pending",
  "accepted",
  "rejected",
  "canceled",
  "expired",
])

const organizationInvitationInviterSchema = v.object({
  id: v.string(),
  name: v.string(),
  email: v.pipe(v.string(), v.email()),
  profileImage: v.nullable(v.string()),
})

const organizationInvitationSchema = v.object({
  id: v.string(),
  email: v.pipe(v.string(), v.email()),
  role: v.picklist(["admin", "member"]),
  status: organizationInvitationStatusSchema,
  organizationId: v.string(),
  inviterId: v.string(),
  inviter: organizationInvitationInviterSchema,
  expiresAt: v.string(),
  createdAt: v.string(),
})

const memberListSchema = v.array(organizationMemberSchema)
const invitationListSchema = v.array(organizationInvitationSchema)

const invitationEmailSchema = v.pipe(
  v.string(),
  v.trim(),
  v.email("Enter a valid email address."),
  v.maxLength(254, "Use 254 characters or fewer.")
)

export const normalizeInvitationEmail = (value: string) =>
  value.trim().toLowerCase()

export const invitationFormSchema = v.object({
  email: invitationEmailSchema,
  role: v.picklist(["admin", "member"]),
})

const memberConfirmationFormSchema = v.object({
  confirmation: v.string(),
})

export const createMemberConfirmationFormSchema = (
  expectedEmail: string,
  action: "remove" | "transfer"
) =>
  v.object({
    confirmation: v.pipe(
      v.string(),
      v.minLength(1, "Enter the member email to confirm."),
      v.check(
        (value) => value === expectedEmail,
        action === "transfer"
          ? `Type ${expectedEmail} exactly to transfer ownership.`
          : `Type ${expectedEmail} exactly to remove this member.`
      )
    ),
  })

export type OrganizationMember = v.InferOutput<typeof organizationMemberSchema>
export type OrganizationInvitation = v.InferOutput<
  typeof organizationInvitationSchema
>
export type OrganizationInvitationStatus = v.InferOutput<
  typeof organizationInvitationStatusSchema
>
export type InvitationFormValues = v.InferOutput<typeof invitationFormSchema>
export type InvitationInput = {
  email: string
  role: InvitationFormValues["role"]
}
export type MemberConfirmationFormValues = v.InferOutput<
  typeof memberConfirmationFormSchema
>

export const parseMembers = (value: unknown) => v.parse(memberListSchema, value)
export const parseInvitations = (value: unknown) =>
  v.parse(invitationListSchema, value)
