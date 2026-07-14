import * as v from "valibot"

import { organizationRoleSchema } from "@/features/organizations/schema"

export const organizationMemberSchema = v.object({
  id: v.string(),
  userId: v.string(),
  name: v.string(),
  email: v.pipe(v.string(), v.email()),
  image: v.nullable(v.string()),
  role: organizationRoleSchema,
  createdAt: v.string(),
})

export const organizationInvitationSchema = v.object({
  id: v.string(),
  email: v.pipe(v.string(), v.email()),
  role: organizationRoleSchema,
  status: v.string(),
  organizationId: v.string(),
  inviterId: v.string(),
  expiresAt: v.string(),
  createdAt: v.string(),
})

export const memberListSchema = v.array(organizationMemberSchema)
export const invitationListSchema = v.array(organizationInvitationSchema)

export const invitationFormSchema = v.object({
  email: v.pipe(v.string(), v.trim(), v.email("Enter a valid email address.")),
  role: v.picklist(["admin", "member"]),
})

export const memberConfirmationFormSchema = v.object({
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
export type InvitationFormValues = v.InferOutput<typeof invitationFormSchema>
export type MemberConfirmationFormValues = v.InferOutput<
  typeof memberConfirmationFormSchema
>

export const parseMembers = (value: unknown) => v.parse(memberListSchema, value)
export const parseInvitations = (value: unknown) =>
  v.parse(invitationListSchema, value)
export const parseInvitation = (value: unknown) =>
  v.parse(organizationInvitationSchema, value)
