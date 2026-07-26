import * as v from "valibot"

import { organizationRoleSchema } from "@/features/organizations"

const organizationMemberSchema = v.object({
  id: v.string(),
  userId: v.string(),
  name: v.string(),
  email: v.pipe(v.string(), v.email()),
  profileImage: v.nullable(v.string()),
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
  v.email("Enter valid email addresses separated by commas or new lines.")
)

const invitationEmailTokens = (value: string) =>
  value
    .split(/[,\n]/u)
    .map((token) => token.trim())
    .filter(Boolean)

export const normalizeInvitationEmails = (value: string) => [
  ...new Set(invitationEmailTokens(value).map((email) => email.toLowerCase())),
]

const invitationEmailsInputSchema = v.pipe(
  v.string(),
  v.check(
    (value) => invitationEmailTokens(value).length > 0,
    "Enter at least one email address."
  ),
  v.check(
    (value) => invitationEmailTokens(value).length <= 20,
    "Enter no more than 20 email addresses at a time."
  ),
  v.check(
    (value) =>
      invitationEmailTokens(value).every((email) => email.length <= 254),
    "Use 254 characters or fewer for each email address."
  ),
  v.check(
    (value) =>
      invitationEmailTokens(value).every(
        (email) => v.safeParse(invitationEmailSchema, email).success
      ),
    "Enter valid email addresses separated by commas or new lines."
  )
)

export const invitationFormSchema = v.object({
  emails: invitationEmailsInputSchema,
  role: v.picklist(["admin", "member"]),
})

const bulkInvitationResponseSchema = v.pipe(
  v.object({
    invitations: invitationListSchema,
    queuedCount: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20)),
    delivery: v.literal("queued"),
  }),
  v.check(
    ({ invitations, queuedCount }) => invitations.length === queuedCount,
    "Invitation response count does not match its records."
  )
)

const resendInvitationResponseSchema = v.object({
  invitation: organizationInvitationSchema,
  delivery: v.literal("queued"),
  revived: v.boolean(),
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
          ? `Type ${expectedEmail} exactly to transfer Super Admin.`
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
export type BulkInvitationInput = {
  emails: string[]
  role: InvitationFormValues["role"]
}
export type MemberConfirmationFormValues = v.InferOutput<
  typeof memberConfirmationFormSchema
>

export const parseMembers = (value: unknown) => v.parse(memberListSchema, value)
export const parseInvitations = (value: unknown) =>
  v.parse(invitationListSchema, value)
export const parseBulkInvitationResponse = (value: unknown) =>
  v.parse(bulkInvitationResponseSchema, value)
export const parseResendInvitationResponse = (value: unknown) =>
  v.parse(resendInvitationResponseSchema, value)
