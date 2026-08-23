import type { ApiClient, Treaty } from "@enterprise-agentic-saas/api/client"
import * as v from "valibot"

const linkedAccountSchema = v.object({
  id: v.optional(v.string()),
  accountId: v.string(),
  providerId: v.string(),
  createdAt: v.optional(v.nullable(v.union([v.string(), v.date()]))),
})

const userPasskeySchema = v.object({
  id: v.string(),
  name: v.optional(v.nullable(v.string())),
  createdAt: v.optional(v.nullable(v.union([v.string(), v.date()]))),
  deviceType: v.optional(v.nullable(v.string())),
  backedUp: v.optional(v.nullable(v.boolean())),
})

const linkedAccountListSchema = v.array(linkedAccountSchema)
const userPasskeyListSchema = v.array(userPasskeySchema)

const deviceAccountSchema = v.pipe(
  v.object({
    session: v.object({ token: v.string() }),
    user: v.object({
      id: v.string(),
      name: v.string(),
      email: v.pipe(v.string(), v.email()),
      image: v.optional(v.nullable(v.string())),
    }),
  }),
  v.transform(({ session, user }) => ({
    session,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      profileImage: user.image ?? null,
    },
  }))
)

const deviceAccountListSchema = v.array(deviceAccountSchema)

const currentDeviceSessionSchema = v.object({
  session: v.object({ token: v.string() }),
  user: v.object({ id: v.string() }),
})

export const profileFormSchema = v.object({
  name: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Enter your name."),
    v.maxLength(100, "Use 100 characters or fewer.")
  ),
})

export type UserProfile = Treaty.Data<ApiClient["me"]["patch"]>
export type Me = Treaty.Data<ApiClient["me"]["get"]>
export type UserSession = Treaty.Data<
  ApiClient["me"]["sessions"]["get"]
>[number]
export type LinkedAccount = v.InferOutput<typeof linkedAccountSchema>
export type UserPasskey = v.InferOutput<typeof userPasskeySchema>
export type DeviceAccount = v.InferOutput<typeof deviceAccountSchema>

export const parseLinkedAccounts = (value: unknown) =>
  v.parse(linkedAccountListSchema, value)
export const parseUserPasskeys = (value: unknown) =>
  v.parse(userPasskeyListSchema, value)
export const parseDeviceAccounts = (value: unknown) =>
  v.parse(deviceAccountListSchema, value)
export const parseCurrentDeviceSession = (value: unknown) =>
  v.parse(currentDeviceSessionSchema, value)
