import type { MultiSessionAuthClient } from "@better-auth-ui/react"
import type { QueryClient } from "@tanstack/react-query"

import { revokeAgentContext } from "@/features/agent"
import {
  clearAuthenticatedQueryCache,
  requireMultiSessionAuthClient,
} from "@/features/auth"
import { apiClient } from "@/lib/api-client"
import { reportObservedError } from "@/lib/report-observed-error"

import {
  parseCurrentDeviceSession,
  parseDeviceAccounts,
  type DeviceAccount,
  type Me,
} from "./schema"

export type AccountIdentityLifecycle = {
  onAbort?: () => void
  onComplete?: () => Promise<void>
}

export const resolveCurrentDeviceAccount = (
  accounts: DeviceAccount[],
  currentUserId: Me["user"]["id"]
) => {
  const matches = accounts.filter(
    (account) => account.user.id === currentUserId
  )
  return matches.length === 1 ? matches[0] : undefined
}

const freshStateError = () =>
  new Error("Account state could not be verified. Reload and try again.")

const readFreshCurrentDeviceSession = async (
  authClient: MultiSessionAuthClient
) => {
  const result = await authClient.getSession({
    fetchOptions: { throw: true },
  })
  return result === null || result === undefined
    ? undefined
    : parseCurrentDeviceSession(result)
}

const readFreshDeviceAccountState = async (
  authClient: MultiSessionAuthClient
) => {
  const [currentSession, accountsResult] = await Promise.all([
    readFreshCurrentDeviceSession(authClient),
    authClient.multiSession.listDeviceSessions({
      fetchOptions: { throw: true },
    }),
  ])
  if (!currentSession) throw freshStateError()

  return {
    accounts: parseDeviceAccounts(accountsResult ?? []),
    currentSession,
  }
}

const verifyFreshIdentity = async ({
  accounts,
  authClient,
  currentUserId,
  target,
}: {
  accounts: DeviceAccount[]
  authClient: MultiSessionAuthClient
  currentUserId: Me["user"]["id"]
  target?: DeviceAccount
}) => {
  const renderedCurrent = resolveCurrentDeviceAccount(accounts, currentUserId)
  if (!renderedCurrent) {
    throw new Error("Account state changed. Reload and try again.")
  }

  const fresh = await readFreshDeviceAccountState(authClient)
  const freshCurrent = resolveCurrentDeviceAccount(
    fresh.accounts,
    fresh.currentSession.user.id
  )
  if (
    fresh.currentSession.user.id !== currentUserId ||
    fresh.currentSession.session.token !== renderedCurrent.session.token ||
    freshCurrent?.session.token !== fresh.currentSession.session.token
  ) {
    throw new Error("Account state changed. Reload and try again.")
  }

  if (target) {
    const freshTargets = fresh.accounts.filter(
      (account) =>
        account.session.token === target.session.token &&
        account.user.id === target.user.id
    )
    if (freshTargets.length !== 1) {
      throw new Error("Account state changed. Reload and try again.")
    }
  }

  return { currentAccount: freshCurrent, freshAccounts: fresh.accounts }
}

const prepareIdentityChange = async (
  queryClient: QueryClient,
  lifecycle: AccountIdentityLifecycle
) => {
  await revokeAgentContext(apiClient)
  lifecycle.onAbort?.()
  await queryClient.cancelQueries()
}

const completeIdentityChange = async (
  queryClient: QueryClient,
  lifecycle: AccountIdentityLifecycle
) => {
  try {
    await lifecycle.onComplete?.()
  } catch (error) {
    reportObservedError(error, { operation: "account.identity.cleanup" })
    // The server identity has already changed. A full-document navigation is
    // now the fail-closed cleanup boundary, so local cleanup must not strand
    // the browser on the old React tree.
  }
  await clearAuthenticatedQueryCache(queryClient)
}

export const switchDeviceAccount = async ({
  account,
  accounts,
  authClient,
  currentUserId,
  lifecycle,
  queryClient,
}: {
  account: DeviceAccount
  accounts: DeviceAccount[]
  authClient: unknown
  currentUserId: Me["user"]["id"]
  lifecycle: AccountIdentityLifecycle
  queryClient: QueryClient
}) => {
  const multiSessionAuthClient = requireMultiSessionAuthClient(authClient)
  await verifyFreshIdentity({
    accounts,
    authClient: multiSessionAuthClient,
    currentUserId,
    target: account,
  })
  await prepareIdentityChange(queryClient, lifecycle)
  await multiSessionAuthClient.multiSession.setActive({
    sessionToken: account.session.token,
    fetchOptions: { throw: true },
  })
  await completeIdentityChange(queryClient, lifecycle)
}

export const signOutCurrentDeviceAccount = async ({
  accounts,
  authClient,
  currentUserId,
  lifecycle,
  queryClient,
}: {
  accounts: DeviceAccount[]
  authClient: unknown
  currentUserId: Me["user"]["id"]
  lifecycle: AccountIdentityLifecycle
  queryClient: QueryClient
}) => {
  const multiSessionAuthClient = requireMultiSessionAuthClient(authClient)
  const { currentAccount } = await verifyFreshIdentity({
    accounts,
    authClient: multiSessionAuthClient,
    currentUserId,
  })
  await prepareIdentityChange(queryClient, lifecycle)
  await multiSessionAuthClient.multiSession.revoke({
    sessionToken: currentAccount.session.token,
    fetchOptions: { throw: true },
  })
  await completeIdentityChange(queryClient, lifecycle)
}

export const removeDeviceAccount = async ({
  account,
  accounts,
  authClient,
  currentUserId,
}: {
  account: DeviceAccount
  accounts: DeviceAccount[]
  authClient: unknown
  currentUserId: Me["user"]["id"]
}) => {
  const multiSessionAuthClient = requireMultiSessionAuthClient(authClient)
  const { currentAccount } = await verifyFreshIdentity({
    accounts,
    authClient: multiSessionAuthClient,
    currentUserId,
    target: account,
  })
  if (currentAccount.session.token === account.session.token) {
    throw new Error("Could not remove account. Try again.")
  }

  await multiSessionAuthClient.multiSession.revoke({
    sessionToken: account.session.token,
    fetchOptions: { throw: true },
  })

  // Better Auth verifies and revokes through separate requests. This post-check
  // contains stale local state, but only a future server-side conditional
  // revoke with an expected-current token can eliminate the residual ABA race.
  try {
    const currentSession = await readFreshCurrentDeviceSession(
      multiSessionAuthClient
    )
    return (
      !currentSession ||
      currentSession.user.id !== currentUserId ||
      currentSession.session.token !== currentAccount.session.token
    )
  } catch (error) {
    reportObservedError(error, { operation: "account.identity.verify" })
    return true
  }
}
