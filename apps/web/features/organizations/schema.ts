import * as v from "valibot"

export const organizationRoleSchema = v.picklist([
  "super_admin",
  "admin",
  "member",
])

export const organizationPermissionsSchema = v.object({
  canEditOrganization: v.boolean(),
  canInviteMembers: v.boolean(),
  canManageMembers: v.boolean(),
  canManageAdmins: v.boolean(),
  canTransferSuperAdmin: v.boolean(),
})

const memberAvatarSchema = v.object({
  userId: v.string(),
  name: v.string(),
  image: v.nullable(v.string()),
})

export const organizationSummarySchema = v.object({
  id: v.string(),
  name: v.string(),
  slug: v.string(),
  role: organizationRoleSchema,
  active: v.boolean(),
  memberCount: v.pipe(v.number(), v.integer()),
  memberAvatars: v.array(memberAvatarSchema),
  permissions: organizationPermissionsSchema,
})

export const organizationDetailSchema = v.object({
  ...organizationSummarySchema.entries,
  logo: v.nullable(v.string()),
  createdAt: v.string(),
  invitationCount: v.pipe(v.number(), v.integer()),
})

export const organizationListSchema = v.array(organizationSummarySchema)

export const organizationDeletionReceiptSchema = v.object({
  deletionId: v.string(),
  organizationId: v.string(),
  status: v.literal("deleted"),
})

export const organizationFormSchema = v.object({
  name: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(2, "Use at least 2 characters."),
    v.maxLength(100, "Use 100 characters or fewer.")
  ),
  slug: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(2, "Use at least 2 characters."),
    v.maxLength(63, "Use 63 characters or fewer."),
    v.regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and single hyphens."
    )
  ),
})

export const createOrganizationDeletionFormSchema = (expectedSlug: string) =>
  v.object({
    slug: v.pipe(
      v.string(),
      v.trim(),
      v.check(
        (value) => value === expectedSlug,
        `Type ${expectedSlug} exactly.`
      )
    ),
    confirmation: v.literal("DELETE", "Type DELETE exactly."),
  })

export type OrganizationRole = v.InferOutput<typeof organizationRoleSchema>
export type OrganizationPermissions = v.InferOutput<
  typeof organizationPermissionsSchema
>
export type OrganizationSummary = v.InferOutput<
  typeof organizationSummarySchema
>
export type OrganizationDetail = v.InferOutput<typeof organizationDetailSchema>
export type OrganizationDeletionReceipt = v.InferOutput<
  typeof organizationDeletionReceiptSchema
>
export type OrganizationFormValues = v.InferOutput<
  typeof organizationFormSchema
>

export const parseOrganization = (value: unknown) =>
  v.parse(organizationDetailSchema, value)
export const parseOrganizations = (value: unknown) =>
  v.parse(organizationListSchema, value)
export const parseOrganizationDeletionReceipt = (value: unknown) =>
  v.parse(organizationDeletionReceiptSchema, value)

export const roleLabel = (role: OrganizationRole) => {
  if (role === "super_admin") {
    return "Super Admin"
  }

  if (role === "admin") {
    return "Admin"
  }

  return "Member"
}

export const toOrganizationSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
