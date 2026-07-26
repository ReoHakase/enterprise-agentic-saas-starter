import { parseDeviceAccounts } from "./schema"

export type MultiSessionCapabilities = {
  listDeviceSessions?: () => Promise<unknown>
  setActive?: (input: { sessionToken: string }) => Promise<unknown>
  revoke?: (input: { sessionToken: string }) => Promise<unknown>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isPropertyContainer = (
  value: unknown
): value is Record<string, unknown> | ((...arguments_: unknown[]) => unknown) =>
  isRecord(value) || typeof value === "function"

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

export const createMultiSessionCapabilities = (
  authClientValue: unknown
): MultiSessionCapabilities => {
  const multiSession = getProperty(authClientValue, "multiSession")
  if (!isPropertyContainer(multiSession)) return {}

  return {
    listDeviceSessions: bindCapability<[]>(multiSession, "listDeviceSessions"),
    setActive: bindCapability<[{ sessionToken: string }]>(
      multiSession,
      "setActive"
    ),
    revoke: bindCapability<[{ sessionToken: string }]>(multiSession, "revoke"),
  }
}

const unwrapAuthResult = (result: unknown, fallback: string): unknown => {
  if (isRecord(result) && result.error) throw new Error(fallback)
  return isRecord(result) && "data" in result ? result.data : result
}

const settleAuthRequest = async (
  request: Promise<unknown>,
  fallback: string
) => {
  try {
    return await request
  } catch {
    throw new Error(fallback)
  }
}

export const createDeviceAccountsQueryFn =
  (authClientValue: unknown) => async () => {
    const listDeviceSessions =
      createMultiSessionCapabilities(authClientValue).listDeviceSessions
    if (!listDeviceSessions) {
      throw new Error("Account switching is not available")
    }
    return parseDeviceAccounts(
      unwrapAuthResult(
        await settleAuthRequest(
          listDeviceSessions(),
          "Accounts could not be loaded. Try again."
        ),
        "Accounts could not be loaded. Try again."
      ) ?? []
    )
  }

export const completeMultiSessionAction = async (
  result: Promise<unknown>,
  fallback: string
) => {
  unwrapAuthResult(await settleAuthRequest(result, fallback), fallback)
}
