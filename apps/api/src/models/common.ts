import * as v from "valibot"

export const nonEmptyStringModel = v.pipe(v.string(), v.minLength(1))

export const isoTimestampModel = v.pipe(v.string(), v.isoTimestamp())

export const organizationRoleModel = v.picklist(["owner", "admin", "member"])

export const organizationIdParamsModel = v.object({
  organizationId: nonEmptyStringModel,
})

export const positiveIntegerQueryModel = (maximum: number) =>
  v.pipe(
    v.union([v.number(), v.string()]),
    v.toNumber(),
    v.number(),
    v.integer(),
    v.minValue(1),
    v.maxValue(maximum)
  )
