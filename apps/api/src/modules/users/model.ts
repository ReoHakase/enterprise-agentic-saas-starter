import * as v from "valibot"

import { isoTimestampModel, nonEmptyStringModel } from "../../models/common"
import { organizationSummaryModel } from "../organizations/model"

export const userModel = v.object({
  id: v.string(),
  name: v.string(),
  email: v.string(),
  image: v.nullable(v.string()),
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
