import * as v from "valibot"

export const nonEmptyStringModel = v.pipe(v.string(), v.minLength(1))

export const isoTimestampModel = v.pipe(v.string(), v.isoTimestamp())

export const dateOnlyModel = v.pipe(
  v.string(),
  v.isoDate(),
  v.metadata({
    description: "UTC calendar date in YYYY-MM-DD format",
    examples: ["2026-07-14"],
  })
)

export const organizationRoleModel = v.picklist([
  "super_admin",
  "admin",
  "member",
])

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
