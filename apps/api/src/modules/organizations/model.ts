import * as v from "valibot"

import {
  isoTimestampModel,
  nonEmptyStringModel,
  organizationIdParamsModel,
  organizationRoleModel,
} from "../../models/common"

export const permissionsModel = v.object({
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
  role: organizationRoleModel,
  active: v.boolean(),
  memberCount: v.number(),
  memberAvatars: v.array(
    v.object({
      userId: v.string(),
      name: v.string(),
      image: v.nullable(v.string()),
    })
  ),
  permissions: permissionsModel,
}

export const organizationSummaryModel = v.object(organizationSummaryEntries)
export const organizationListModel = v.array(organizationSummaryModel)

export const organizationDetailModel = v.object({
  ...organizationSummaryEntries,
  logo: v.nullable(v.string()),
  createdAt: isoTimestampModel,
  invitationCount: v.number(),
})

export const memberModel = v.object({
  id: v.string(),
  userId: v.string(),
  name: v.string(),
  email: v.string(),
  image: v.nullable(v.string()),
  role: organizationRoleModel,
  createdAt: isoTimestampModel,
})

export const memberListModel = v.array(memberModel)

export const invitationModel = v.object({
  id: v.string(),
  email: v.string(),
  role: organizationRoleModel,
  status: v.string(),
  organizationId: v.string(),
  inviterId: v.string(),
  expiresAt: isoTimestampModel,
  createdAt: isoTimestampModel,
})

export const invitationListModel = v.array(invitationModel)

export const invitationBatchModel = v.object({
  invitations: invitationListModel,
  queuedCount: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20)),
  delivery: v.literal("queued"),
})

const manageableRoleModel = v.picklist(["admin", "member"])

const destructiveConfirmationModel = v.pipe(
  nonEmptyStringModel,
  v.metadata({
    description:
      "誤操作防止の確認文字列。ownership transferとmember削除は対象member emailを完全一致で送る。",
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
      "16〜128文字のopaqueな冪等性key。同じuserの別organizationには再利用しない。",
    examples: ["delete_org_01JQ8YF2J7Q0J2X8R8S3Q9M6P4"],
  })
)

export const deleteOrganizationBodyModel = v.object({
  slug: v.pipe(
    nonEmptyStringModel,
    v.metadata({
      description: "削除対象organizationのslugを完全一致で入力する。",
      examples: ["acme"],
    })
  ),
  confirmation: v.pipe(
    v.literal("DELETE"),
    v.metadata({
      description: "破壊的操作の確認文字列。必ずDELETEを指定する。",
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
