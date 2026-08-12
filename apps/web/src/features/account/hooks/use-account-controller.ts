"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  completeSecurityMutation,
  securityMutationErrorCode,
  securityMutationErrorMessage,
  type SecurityAuthCapabilities,
} from "../security-client"

type AddPasskey = NonNullable<
  NonNullable<SecurityAuthCapabilities["passkey"]>["addPasskey"]
>

export const securityMethodsKey = ["account", "security-methods"] as const

const pendingSecurityActionKey = "enterprise-saas:pending-security-action"
const pendingPasskeyAction = "account.passkey.add"
const passkeyRegistrationFallback =
  "The security method could not be updated. Try again."

const markPasskeyReauthenticationPending = () => {
  try {
    window.sessionStorage.setItem(
      pendingSecurityActionKey,
      pendingPasskeyAction
    )
  } catch {
    // A blocked storage API must not prevent the user from reauthenticating.
  }
}

const consumePendingPasskeyAction = () => {
  try {
    if (
      window.sessionStorage.getItem(pendingSecurityActionKey) !==
      pendingPasskeyAction
    ) {
      return false
    }
    window.sessionStorage.removeItem(pendingSecurityActionKey)
    return true
  } catch {
    return false
  }
}

export const useAccountController = (addPasskey: AddPasskey | undefined) => {
  const queryClient = useQueryClient()
  const router = useRouter()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [reauthenticationOpen, setReauthenticationOpen] = useState(false)
  const mutation = useMutation({
    mutationFn: async () => {
      if (!addPasskey) throw new Error("Unavailable")
      await completeSecurityMutation(
        addPasskey({ name: "Enterprise Agentic SaaS" })
      )
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: securityMethodsKey })
      router.refresh()
      toast.success("Passkey added")
    },
    onError: (error) => {
      if (securityMutationErrorCode(error) === "SESSION_NOT_FRESH") {
        setReauthenticationOpen(true)
        return
      }
      toast.error(
        securityMutationErrorMessage(error, passkeyRegistrationFallback)
      )
    },
  })
  const { mutate } = mutation
  const register = useCallback(() => mutate(), [mutate])
  const continueReauthentication = useCallback(() => {
    markPasskeyReauthenticationPending()
    setReauthenticationOpen(false)
    router.push(
      `/auth/sign-in?reauth=1&action=${pendingPasskeyAction}&redirectTo=/settings/account`
    )
  }, [router])
  const handleReauthenticationOpenChange = useCallback((open: boolean) => {
    setReauthenticationOpen(open)
    if (!open) triggerRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!addPasskey || !consumePendingPasskeyAction()) return
    mutate()
  }, [addPasskey, mutate])

  return {
    continueReauthentication,
    handleReauthenticationOpenChange,
    mutation,
    reauthenticationOpen,
    register,
    triggerRef,
  }
}
