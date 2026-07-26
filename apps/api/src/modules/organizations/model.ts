import * as v from "valibot"

import {
  isoTimestampModel,
  nonEmptyStringModel,
  organizationIdParamsModel,
  organizationRoleModel,
} from "../../models/common"

const permissionsModel = v.object({
  canEditOrganization: v.boolean(),
  canInviteMembers: v.boolean(),
  canManageMembers: v.boolean(),
  canManageAdmins: v.boolean(),
  canTransferSuperAdmin: v.boolean(),
})

const organizationSummaryEntries = {
  id: v.string(),
  name: v.string(),
  slug: v.string(),
  profileImage: v.nullable(v.string()),
  role: organizationRoleModel,
  active: v.boolean(),
  memberCount: v.number(),
  memberProfileImages: v.array(
    v.object({
      userId: v.string(),
      name: v.string(),
      profileImage: v.nullable(v.string()),
    })
  ),
  permissions: permissionsModel,
}

export const organizationSummaryModel = v.object(organizationSummaryEntries)
export const organizationListModel = v.array(organizationSummaryModel)

export const organizationDetailModel = v.object({
  ...organizationSummaryEntries,
  createdAt: isoTimestampModel,
  invitationCount: v.number(),
})

const memberModel = v.object({
  id: v.string(),
  userId: v.string(),
  name: v.string(),
  email: v.string(),
  profileImage: v.nullable(v.string()),
  role: organizationRoleModel,
  createdAt: isoTimestampModel,
})

export const memberListModel = v.array(memberModel)

const invitationModel = v.object({
  id: v.string(),
  email: v.string(),
  role: organizationRoleModel,
  status: v.string(),
  organizationId: v.string(),
  inviterId: v.string(),
  inviter: v.object({
    id: v.string(),
    name: v.string(),
    email: v.string(),
    profileImage: v.nullable(v.string()),
  }),
  expiresAt: isoTimestampModel,
  createdAt: isoTimestampModel,
})

export const invitationListModel = v.array(invitationModel)

export const invitationBatchModel = v.object({
  invitations: invitationListModel,
  queuedCount: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20)),
  delivery: v.literal("queued"),
})

export const resendInvitationResponseModel = v.object({
  invitation: invitationModel,
  delivery: v.literal("queued"),
  revived: v.boolean(),
})

const manageableRoleModel = v.picklist(["admin", "member"])

const destructiveConfirmationModel = v.pipe(
  nonEmptyStringModel,
  v.metadata({
    description:
      "Confirmation value that must exactly match the target member email for ownership transfers and member removal.",
    examples: ["new-owner@example.com"],
  })
)

export const createOrganizationBodyModel = v.object({
  name: nonEmptyStringModel,
  slug: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  keepCurrentActiveOrganization: v.optional(v.boolean()),
})

export const activateOrganizationResponseModel = v.object({
  activeOrganizationId: v.string(),
})

export const updateOrganizationBodyModel = v.object({
  name: v.optional(v.string()),
  slug: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(100))),
})

export const organizationDeletionIdempotencyKeyModel = v.pipe(
  v.string(),
  v.minLength(16),
  v.maxLength(128),
  v.regex(/^[A-Za-z0-9._:-]+$/),
  v.metadata({
    description:
      "Opaque idempotency key of 16 to 128 characters that must not be reused by the same user for another organization.",
    examples: ["delete_org_01JQ8YF2J7Q0J2X8R8S3Q9M6P4"],
  })
)

export const deleteOrganizationBodyModel = v.object({
  slug: v.pipe(
    nonEmptyStringModel,
    v.metadata({
      description:
        "Exact slug of the organization being deleted, supplied as a destructive-action confirmation.",
      examples: ["acme"],
    })
  ),
  confirmation: v.pipe(
    v.literal("DELETE"),
    v.metadata({
      description:
        "Destructive-action confirmation that must contain the exact value DELETE.",
      examples: ["DELETE"],
    })
  ),
  idempotencyKey: organizationDeletionIdempotencyKeyModel,
})

export const deleteOrganizationResponseModel = v.object({
  deletionId: v.string(),
  organizationId: v.string(),
  status: v.literal("deleted"),
})

export const organizationMemberParamsModel = v.object({
  organizationId: nonEmptyStringModel,
  memberId: nonEmptyStringModel,
})

export const updateMemberRoleBodyModel = v.object({
  role: manageableRoleModel,
})

export const transferSuperAdminBodyModel = v.object({
  memberId: nonEmptyStringModel,
  confirmation: destructiveConfirmationModel,
})

export const removeMemberBodyModel = v.object({
  confirmation: destructiveConfirmationModel,
})

export const idResponseModel = v.object({ id: v.string() })

export const createInvitationBodyModel = v.object({
  emails: v.pipe(
    v.array(v.pipe(v.string(), v.trim(), v.email())),
    v.minLength(1),
    v.maxLength(20)
  ),
  role: manageableRoleModel,
})

export const organizationInvitationParamsModel = v.object({
  organizationId: nonEmptyStringModel,
  invitationId: nonEmptyStringModel,
})

export const canceledInvitationResponseModel = v.object({
  id: v.string(),
  status: v.string(),
})

export { organizationIdParamsModel }
