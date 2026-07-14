import type { SecurityMethods } from "@/features/account/schema"
import { parseSecurityMethods } from "@/features/account/schema"

export type SecurityAuthCapabilities = {
  listAccounts?: () => Promise<unknown>
  linkSocial?: (input: {
    provider: "github"
    callbackURL: string
  }) => Promise<unknown>
  unlinkAccount?: (input: {
    providerId: string
    accountId?: string
  }) => Promise<unknown>
  passkey?: {
    listUserPasskeys?: () => Promise<unknown>
    addPasskey?: (input: {
      name?: string
      authenticatorAttachment?: "platform" | "cross-platform"
    }) => Promise<unknown>
    deletePasskey?: (input: { id: string }) => Promise<unknown>
  }
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isPropertyContainer = (
  value: unknown
): value is Record<string, unknown> | ((...args: unknown[]) => unknown) =>
  (typeof value === "object" && value !== null) || typeof value === "function"

const getProperty = (target: unknown, key: string): unknown => {
  if (!isPropertyContainer(target)) return undefined
  return Reflect.get(target, key)
}

const bindCapability = <TArguments extends unknown[]>(
  target: unknown,
  key: string
): ((...arguments_: TArguments) => Promise<unknown>) | undefined => {
  const candidate = getProperty(target, key)
  if (typeof candidate !== "function") return undefined
  return (...arguments_: TArguments) =>
    Promise.resolve(Reflect.apply(candidate, target, arguments_))
}

export const createSecurityAuthCapabilities = (
  authClient: unknown
): SecurityAuthCapabilities => {
  if (!isPropertyContainer(authClient)) return {}

  const passkey = getProperty(authClient, "passkey")
  const passkeyCapabilities = isPropertyContainer(passkey)
    ? {
        listUserPasskeys: bindCapability<[]>(passkey, "listUserPasskeys"),
        addPasskey: bindCapability<
          [
            {
              name?: string
              authenticatorAttachment?: "platform" | "cross-platform"
            },
          ]
        >(passkey, "addPasskey"),
        deletePasskey: bindCapability<[{ id: string }]>(
          passkey,
          "deletePasskey"
        ),
      }
    : undefined

  return {
    listAccounts: bindCapability<[]>(authClient, "listAccounts"),
    linkSocial: bindCapability<[{ provider: "github"; callbackURL: string }]>(
      authClient,
      "linkSocial"
    ),
    unlinkAccount: bindCapability<[{ providerId: string; accountId?: string }]>(
      authClient,
      "unlinkAccount"
    ),
    passkey: passkeyCapabilities,
  }
}

const unwrapAuthResult = (result: unknown): unknown => {
  if (isObjectRecord(result) && "error" in result && result.error) {
    throw new Error("Authentication request failed")
  }
  if (isObjectRecord(result) && "data" in result) {
    return result.data
  }
  return result
}

const authenticationRequestFailed = () =>
  new Error("Authentication request failed")

const settleAuthRequest = async (request: Promise<unknown>) => {
  try {
    return await request
  } catch {
    throw authenticationRequestFailed()
  }
}

export const hasSecurityMethodsCapability = (
  capabilities: SecurityAuthCapabilities
) =>
  Boolean(
    capabilities.listAccounts ||
    capabilities.linkSocial ||
    capabilities.unlinkAccount ||
    capabilities.passkey?.listUserPasskeys ||
    capabilities.passkey?.addPasskey ||
    capabilities.passkey?.deletePasskey
  )

export const loadSecurityMethods = async (
  capabilities: SecurityAuthCapabilities
): Promise<SecurityMethods> => {
  const [accountResult, passkeyResult] = await Promise.all([
    settleAuthRequest(capabilities.listAccounts?.() ?? Promise.resolve([])),
    settleAuthRequest(
      capabilities.passkey?.listUserPasskeys?.() ?? Promise.resolve([])
    ),
  ])

  return parseSecurityMethods({
    accounts: unwrapAuthResult(accountResult) ?? [],
    passkeys: unwrapAuthResult(passkeyResult) ?? [],
  })
}

export const completeSecurityMutation = async (result: Promise<unknown>) => {
  unwrapAuthResult(await settleAuthRequest(result))
}
