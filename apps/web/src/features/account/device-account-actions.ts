import type { QueryClient } from "@tanstack/react-query"

import { revokeAgentContext } from "@/features/agent"
import { clearAuthenticatedQueryCache } from "@/features/auth"
import { apiClient } from "@/lib/api-client"

import {
  completeMultiSessionAction,
  readFreshCurrentDeviceSession,
  readFreshDeviceAccountState,
  type MultiSessionCapabilities,
} from "./multi-session-client"
import type { DeviceAccount, Me } from "./schema"

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

const verifyFreshIdentity = async ({
  accounts,
  currentUserId,
  multiSession,
  target,
}: {
  accounts: DeviceAccount[]
  currentUserId: Me["user"]["id"]
  multiSession: MultiSessionCapabilities
  target?: DeviceAccount
}) => {
  const renderedCurrent = resolveCurrentDeviceAccount(accounts, currentUserId)
  if (!renderedCurrent) {
    throw new Error("Account state changed. Reload and try again.")
  }

  const fresh = await readFreshDeviceAccountState(multiSession)
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
  } catch {
    // The server identity has already changed. A full-document navigation is
    // now the fail-closed cleanup boundary, so local cleanup must not strand
    // the browser on the old React tree.
  }
  await clearAuthenticatedQueryCache(queryClient)
}

export const switchDeviceAccount = async ({
  account,
  accounts,
  currentUserId,
  lifecycle,
  multiSession,
  queryClient,
}: {
  account: DeviceAccount
  accounts: DeviceAccount[]
  currentUserId: Me["user"]["id"]
  lifecycle: AccountIdentityLifecycle
  multiSession: MultiSessionCapabilities
  queryClient: QueryClient
}) => {
  if (!multiSession.setActive) {
    throw new Error("Could not switch account. Try again.")
  }

  await verifyFreshIdentity({
    accounts,
    currentUserId,
    multiSession,
    target: account,
  })
  await prepareIdentityChange(queryClient, lifecycle)
  await completeMultiSessionAction(
    multiSession.setActive({ sessionToken: account.session.token }),
    "Could not switch account. Try again."
  )
  await completeIdentityChange(queryClient, lifecycle)
}

export const signOutCurrentDeviceAccount = async ({
  accounts,
  currentUserId,
  lifecycle,
  multiSession,
  queryClient,
}: {
  accounts: DeviceAccount[]
  currentUserId: Me["user"]["id"]
  lifecycle: AccountIdentityLifecycle
  multiSession: MultiSessionCapabilities
  queryClient: QueryClient
}) => {
  if (!multiSession.revoke) {
    throw new Error("Could not sign out. Try again.")
  }

  const { currentAccount } = await verifyFreshIdentity({
    accounts,
    currentUserId,
    multiSession,
  })
  await prepareIdentityChange(queryClient, lifecycle)
  await completeMultiSessionAction(
    multiSession.revoke({
      sessionToken: currentAccount.session.token,
    }),
    "Could not sign out. Try again."
  )
  await completeIdentityChange(queryClient, lifecycle)
}

export const removeDeviceAccount = async ({
  account,
  accounts,
  currentUserId,
  multiSession,
}: {
  account: DeviceAccount
  accounts: DeviceAccount[]
  currentUserId: Me["user"]["id"]
  multiSession: MultiSessionCapabilities
}) => {
  if (!multiSession.revoke) {
    throw new Error("Could not remove account. Try again.")
  }

  const { currentAccount } = await verifyFreshIdentity({
    accounts,
    currentUserId,
    multiSession,
    target: account,
  })
  if (currentAccount.session.token === account.session.token) {
    throw new Error("Could not remove account. Try again.")
  }

  await completeMultiSessionAction(
    multiSession.revoke({ sessionToken: account.session.token }),
    "Could not remove account. Try again."
  )

  // Better Auth verifies and revokes through separate requests. This post-check
  // contains stale local state, but only a future server-side conditional
  // revoke with an expected-current token can eliminate the residual ABA race.
  try {
    const currentSession = await readFreshCurrentDeviceSession(multiSession)
    return (
      !currentSession ||
      currentSession.user.id !== currentUserId ||
      currentSession.session.token !== currentAccount.session.token
    )
  } catch {
    return true
  }
}
