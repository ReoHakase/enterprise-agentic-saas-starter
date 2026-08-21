import type { ApiClient, Treaty } from "@enterprise-agentic-saas/api/client"
import * as v from "valibot"

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

type OrganizationRoutes = ReturnType<ApiClient["organizations"]>

export type OrganizationMember = Treaty.Data<
  OrganizationRoutes["members"]["get"]
>[number]
export type OrganizationInvitation = Treaty.Data<
  OrganizationRoutes["invitations"]["get"]
>[number]
export type OrganizationInvitationStatus = OrganizationInvitation["status"]
export type InvitationFormValues = v.InferOutput<typeof invitationFormSchema>
export type InvitationInput = {
  email: string
  role: InvitationFormValues["role"]
}
export type MemberConfirmationFormValues = v.InferOutput<
  typeof memberConfirmationFormSchema
>
