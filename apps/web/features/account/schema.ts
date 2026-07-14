import * as v from "valibot"

import { organizationSummarySchema } from "@/features/organizations/schema"

export const userProfileSchema = v.object({
  id: v.string(),
  name: v.string(),
  email: v.pipe(v.string(), v.email()),
  image: v.nullable(v.string()),
})

export const meSchema = v.object({
  user: userProfileSchema,
  activeOrganizationId: v.nullable(v.string()),
  organizations: v.array(organizationSummarySchema),
})

export const userSessionSchema = v.object({
  id: v.string(),
  current: v.boolean(),
  expiresAt: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  ipAddress: v.nullable(v.string()),
  userAgent: v.nullable(v.string()),
})

export const userSessionListSchema = v.array(userSessionSchema)

export const linkedAccountSchema = v.object({
  id: v.optional(v.string()),
  accountId: v.optional(v.string()),
  providerId: v.string(),
  createdAt: v.optional(v.nullable(v.union([v.string(), v.date()]))),
})

export const userPasskeySchema = v.object({
  id: v.string(),
  name: v.optional(v.nullable(v.string())),
  createdAt: v.optional(v.nullable(v.union([v.string(), v.date()]))),
  deviceType: v.optional(v.nullable(v.string())),
  backedUp: v.optional(v.nullable(v.boolean())),
})

export const securityMethodsSchema = v.object({
  accounts: v.array(linkedAccountSchema),
  passkeys: v.array(userPasskeySchema),
})

export const deviceAccountSchema = v.object({
  session: v.object({ token: v.string() }),
  user: v.object({
    id: v.string(),
    name: v.string(),
    email: v.pipe(v.string(), v.email()),
    image: v.optional(v.nullable(v.string())),
  }),
})

export const deviceAccountListSchema = v.array(deviceAccountSchema)

export const profileFormSchema = v.object({
  name: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Enter your name."),
    v.maxLength(100, "Use 100 characters or fewer.")
  ),
})

export type UserProfile = v.InferOutput<typeof userProfileSchema>
export type Me = v.InferOutput<typeof meSchema>
export type UserSession = v.InferOutput<typeof userSessionSchema>
export type LinkedAccount = v.InferOutput<typeof linkedAccountSchema>
export type UserPasskey = v.InferOutput<typeof userPasskeySchema>
export type SecurityMethods = v.InferOutput<typeof securityMethodsSchema>
export type DeviceAccount = v.InferOutput<typeof deviceAccountSchema>

export const parseMe = (value: unknown) => v.parse(meSchema, value)
export const parseUserProfile = (value: unknown) =>
  v.parse(userProfileSchema, value)
export const parseUserSessions = (value: unknown) =>
  v.parse(userSessionListSchema, value)
export const parseSecurityMethods = (value: unknown) =>
  v.parse(securityMethodsSchema, value)
export const parseDeviceAccounts = (value: unknown) =>
  v.parse(deviceAccountListSchema, value)
