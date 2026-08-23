"use client"

import { useAuth, useListDeviceSessions } from "@better-auth-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import {
  hasOrganizationSwitchRisks,
  type OrganizationSwitchRisks,
} from "@/features/agent"
import { requireMultiSessionAuthClient } from "@/features/auth"
import { reportObservedError } from "@/lib/report-observed-error"

import { navigateAfterAccountSwitch } from "../account-switch-navigation"
import {
  removeDeviceAccount,
  resolveCurrentDeviceAccount,
  signOutCurrentDeviceAccount,
  switchDeviceAccount,
  type AccountIdentityLifecycle,
} from "../device-account-actions"
import { parseDeviceAccounts, type DeviceAccount, type Me } from "../schema"

type IdentityAction =
  | { kind: "switch"; account: DeviceAccount }
  | { kind: "sign-out" }
  | { kind: "remove"; account: DeviceAccount }

type RiskAction = Exclude<IdentityAction, { kind: "remove" }>

export type DeviceAccountsController = ReturnType<
  typeof useDeviceAccountsController
>

export const useDeviceAccountsController = ({
  currentUser,
  enabled,
  onPrepareIdentityChange,
  onAbortIdentityChange,
  onCancelIdentityChange,
  onCompleteIdentityChange,
  returnTo = "/dashboard",
}: {
  currentUser: Me["user"]
  enabled: boolean
  onPrepareIdentityChange?: () => OrganizationSwitchRisks
  onAbortIdentityChange?: () => void
  onCancelIdentityChange?: () => void
  onCompleteIdentityChange?: () => Promise<void>
  returnTo?: string
}) => {
  const { authClient: authClientValue } = useAuth()
  const queryClient = useQueryClient()
  const authClient = useMemo(
    () => requireMultiSessionAuthClient(authClientValue),
    [authClientValue]
  )
  const [removeTarget, setRemoveTarget] = useState<DeviceAccount>()
  const [riskAction, setRiskAction] = useState<RiskAction>()
  const actionFenceRef = useRef(false)
  const rawAccountsQuery = useListDeviceSessions(authClient, {
    enabled,
    retry: false,
  })
  const parsedAccounts = useMemo(() => {
    if (rawAccountsQuery.data === undefined) return undefined
    try {
      return parseDeviceAccounts(rawAccountsQuery.data)
    } catch {
      return null
    }
  }, [rawAccountsQuery.data])
  const accounts = useMemo(() => parsedAccounts ?? [], [parsedAccounts])
  const accountsQuery = {
    isError: rawAccountsQuery.isError || parsedAccounts === null,
    isPending: rawAccountsQuery.isPending,
  }
  const { refetch: refetchAccounts } = rawAccountsQuery
  const lifecycle = useMemo<AccountIdentityLifecycle>(
    () => ({
      onAbort: onAbortIdentityChange,
      onComplete: onCompleteIdentityChange,
    }),
    [onAbortIdentityChange, onCompleteIdentityChange]
  )
  const actionMutation = useMutation({
    mutationFn: async (action: IdentityAction) => {
      if (action.kind === "remove") {
        const identityChanged = await removeDeviceAccount({
          account: action.account,
          accounts,
          authClient,
          currentUserId: currentUser.id,
        })
        if (identityChanged) {
          lifecycle.onAbort?.()
          await queryClient.cancelQueries()
          try {
            await lifecycle.onComplete?.()
          } catch (error) {
            reportObservedError(error, {
              operation: "account.identity.cleanup",
            })
            // The active identity changed during removal. Navigation remains
            // the final cleanup boundary even if local teardown is incomplete.
          }
          queryClient.clear()
        }
        return { ...action, identityChanged }
      }
      if (action.kind === "switch") {
        await switchDeviceAccount({
          account: action.account,
          accounts,
          authClient,
          currentUserId: currentUser.id,
          lifecycle,
          queryClient,
        })
        return action
      }
      await signOutCurrentDeviceAccount({
        accounts,
        authClient,
        currentUserId: currentUser.id,
        lifecycle,
        queryClient,
      })
      return action
    },
    onSuccess: async (action) => {
      if (action.kind === "remove") {
        setRemoveTarget(undefined)
        if (action.identityChanged) {
          navigateAfterAccountSwitch(returnTo)
          return
        }
        toast.success(`${action.account.user.email} was removed`)
        await refetchAccounts()
        return
      }

      if (action.kind === "switch") {
        toast.success(`Switched to ${action.account.user.email}`)
      }
      navigateAfterAccountSwitch(returnTo)
    },
    onError: (_, action) => {
      if (action.kind !== "remove") onCancelIdentityChange?.()
      const message =
        action.kind === "switch"
          ? "Could not switch account. Try again."
          : action.kind === "remove"
            ? "Could not remove account. Try again."
            : "Could not sign out. Try again."
      toast.error(message)
    },
    onSettled: () => {
      actionFenceRef.current = false
    },
  })
  const { mutate: mutateAction } = actionMutation
  const submitAction = useCallback(
    (action: IdentityAction) => {
      if (actionFenceRef.current) return
      actionFenceRef.current = true
      mutateAction(action)
    },
    [mutateAction]
  )
  const requestRiskAction = useCallback(
    (action: RiskAction) => {
      if (actionFenceRef.current || riskAction) return
      const risks = onPrepareIdentityChange?.()
      if (risks && hasOrganizationSwitchRisks(risks)) {
        setRiskAction(action)
        return
      }
      submitAction(action)
    },
    [onPrepareIdentityChange, riskAction, submitAction]
  )
  const requestSwitch = useCallback(
    (account: DeviceAccount) => {
      const currentAccount = resolveCurrentDeviceAccount(
        accounts,
        currentUser.id
      )
      if (currentAccount?.session.token === account.session.token) return
      requestRiskAction({ kind: "switch", account })
    },
    [accounts, currentUser.id, requestRiskAction]
  )
  const requestSignOut = useCallback(
    () => requestRiskAction({ kind: "sign-out" }),
    [requestRiskAction]
  )
  const requestRemove = useCallback((account: DeviceAccount) => {
    if (actionFenceRef.current) return
    setRemoveTarget(account)
  }, [])
  const confirmRiskAction = useCallback(() => {
    if (!riskAction) return
    const action = riskAction
    setRiskAction(undefined)
    submitAction(action)
  }, [riskAction, submitAction])
  const cancelRiskAction = useCallback(() => {
    setRiskAction(undefined)
    onCancelIdentityChange?.()
  }, [onCancelIdentityChange])
  const confirmRemove = useCallback(() => {
    if (removeTarget) submitAction({ kind: "remove", account: removeTarget })
  }, [removeTarget, submitAction])
  const handleRiskDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open && riskAction) cancelRiskAction()
    },
    [cancelRiskAction, riskAction]
  )
  const handleRemoveDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !actionMutation.isPending) setRemoveTarget(undefined)
    },
    [actionMutation.isPending]
  )
  const retryAccounts = useCallback(() => {
    void refetchAccounts()
  }, [refetchAccounts])
  const pendingToken =
    actionMutation.variables?.kind === "switch" ||
    actionMutation.variables?.kind === "remove"
      ? actionMutation.variables.account.session.token
      : undefined

  return {
    accounts,
    accountsQuery,
    actionMutation,
    cancelRiskAction,
    confirmRemove,
    confirmRiskAction,
    currentAccount: resolveCurrentDeviceAccount(accounts, currentUser.id),
    handleRemoveDialogOpenChange,
    handleRiskDialogOpenChange,
    pendingToken,
    removeTarget,
    requestRemove,
    requestSignOut,
    requestSwitch,
    retryAccounts,
    riskAction,
  }
}
