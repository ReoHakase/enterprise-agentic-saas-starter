import { parseCurrentDeviceSession, parseDeviceAccounts } from "./schema"

export type MultiSessionCapabilities = {
  getSession?: () => Promise<unknown>
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
    getSession: bindCapability<[]>(authClientValue, "getSession"),
    listDeviceSessions: bindCapability<[]>(multiSession, "listDeviceSessions"),
    setActive: bindCapability<[{ sessionToken: string }]>(
      multiSession,
      "setActive"
    ),
    revoke: bindCapability<[{ sessionToken: string }]>(multiSession, "revoke"),
  }
}

const unwrapAuthResult = (result: unknown): unknown => {
  if (isRecord(result) && result.error) throw result.error
  return isRecord(result) && "data" in result ? result.data : result
}

export const createDeviceAccountsQueryFn =
  (authClientValue: unknown) => async () => {
    const listDeviceSessions =
      createMultiSessionCapabilities(authClientValue).listDeviceSessions
    if (!listDeviceSessions) {
      throw new Error("Account switching is not available")
    }
    return parseDeviceAccounts(
      unwrapAuthResult(await listDeviceSessions()) ?? []
    )
  }

export const completeMultiSessionAction = async (result: Promise<unknown>) => {
  unwrapAuthResult(await result)
}

export const readFreshCurrentDeviceSession = async (
  multiSession: MultiSessionCapabilities
) => {
  if (!multiSession.getSession) {
    throw new Error(
      "Account state could not be verified. Reload and try again."
    )
  }

  const result = unwrapAuthResult(await multiSession.getSession())
  return result === null || result === undefined
    ? undefined
    : parseCurrentDeviceSession(result)
}

export const readFreshDeviceAccountState = async (
  multiSession: MultiSessionCapabilities
) => {
  if (!multiSession.getSession || !multiSession.listDeviceSessions) {
    throw new Error(
      "Account state could not be verified. Reload and try again."
    )
  }

  const [currentSession, accountsResult] = await Promise.all([
    readFreshCurrentDeviceSession(multiSession),
    multiSession.listDeviceSessions(),
  ])
  if (!currentSession) {
    throw new Error(
      "Account state could not be verified. Reload and try again."
    )
  }

  return {
    accounts: parseDeviceAccounts(unwrapAuthResult(accountsResult) ?? []),
    currentSession,
  }
}
