import * as v from "valibot"

import { isoTimestampModel, nonEmptyStringModel } from "../../models/common"
import { organizationSummaryModel } from "../organizations/public"

export const userModel = v.object({
  id: v.string(),
  name: v.string(),
  email: v.string(),
  profileImage: v.nullable(v.string()),
})

export const currentUserModel = v.object({
  user: userModel,
  activeOrganizationId: v.nullable(v.string()),
  organizations: v.array(organizationSummaryModel),
})

export const updateUserBodyModel = v.object({ name: nonEmptyStringModel })

const userSessionModel = v.object({
  id: v.string(),
  current: v.boolean(),
  expiresAt: isoTimestampModel,
  createdAt: isoTimestampModel,
  updatedAt: isoTimestampModel,
  ipAddress: v.nullable(v.string()),
  userAgent: v.nullable(v.string()),
})

export const userSessionListModel = v.array(userSessionModel)

export const revokedSessionsResponseModel = v.object({
  revoked: v.pipe(v.number(), v.minValue(0)),
})

export const userSessionParamsModel = v.object({
  sessionId: nonEmptyStringModel,
})

export const revokedSessionResponseModel = v.object({ id: v.string() })

const mcpOAuthCredentialModel = v.object({
  clientName: v.string(),
  createdAt: v.nullable(isoTimestampModel),
  credentialId: nonEmptyStringModel,
  expiresAt: v.nullable(isoTimestampModel),
  organization: v.nullable(organizationSummaryModel),
  refreshable: v.boolean(),
  scopes: v.array(nonEmptyStringModel),
})

export const mcpOAuthCredentialListModel = v.array(mcpOAuthCredentialModel)
export const mcpOAuthCredentialParamsModel = v.object({
  credentialId: nonEmptyStringModel,
})
