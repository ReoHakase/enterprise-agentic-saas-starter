import * as v from "valibot"

export const organizationRoleSchema = v.picklist(["owner", "admin", "member"])

const organizationPermissionsSchema = v.object({
  canEditOrganization: v.boolean(),
  canInviteMembers: v.boolean(),
  canManageMembers: v.boolean(),
  canManageAdmins: v.boolean(),
  canTransferOwnership: v.boolean(),
})

const memberProfileImageSchema = v.object({
  userId: v.string(),
  name: v.string(),
  profileImage: v.nullable(v.string()),
})

export const organizationSummarySchema = v.object({
  id: v.string(),
  name: v.string(),
  slug: v.string(),
  role: organizationRoleSchema,
  active: v.boolean(),
  profileImage: v.nullable(v.string()),
  memberCount: v.pipe(v.number(), v.integer()),
  memberProfileImages: v.array(memberProfileImageSchema),
  permissions: organizationPermissionsSchema,
})

const organizationDetailSchema = v.object({
  ...organizationSummarySchema.entries,
  createdAt: v.string(),
  invitationCount: v.pipe(v.number(), v.integer()),
})

const organizationListSchema = v.array(organizationSummarySchema)

const reservedOrganizationSlugs = new Set([
  "admin",
  "api",
  "auth",
  "create",
  "dashboard",
  "new",
  "openapi",
  "organization",
  "organizations",
  "settings",
  "issues",
])

const organizationDeletionReceiptSchema = v.object({
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
    v.minLength(3, "Use at least 3 characters."),
    v.maxLength(48, "Use 48 characters or fewer."),
    v.regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and single hyphens."
    ),
    v.check(
      (slug) => !reservedOrganizationSlugs.has(slug),
      "Choose another slug. This value is reserved."
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
export type OrganizationSummary = v.InferOutput<
  typeof organizationSummarySchema
>
export type OrganizationDetail = v.InferOutput<typeof organizationDetailSchema>

export const parseOrganization = (value: unknown) =>
  v.parse(organizationDetailSchema, value)
export const parseOrganizations = (value: unknown) =>
  v.parse(organizationListSchema, value)
export const parseOrganizationDeletionReceipt = (value: unknown) =>
  v.parse(organizationDeletionReceiptSchema, value)

export const roleLabel = (role: OrganizationRole) => {
  if (role === "owner") {
    return "Owner"
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
