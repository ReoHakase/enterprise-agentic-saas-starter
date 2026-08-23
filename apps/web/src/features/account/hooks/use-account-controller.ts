"use client"

import { type PasskeyAuthClient, useAddPasskey } from "@better-auth-ui/react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react"
import { toast } from "sonner"

import { safeAuthErrorCode, safeAuthErrorMessage } from "@/features/auth"

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

export const useAccountController = (authClient: PasskeyAuthClient) => {
  const router = useRouter()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [reauthenticationOpen, setReauthenticationOpen] = useState(false)
  const mutation = useAddPasskey(authClient, {
    onSuccess: () => {
      toast.success("Passkey added")
    },
    onError: (error) => {
      if (safeAuthErrorCode(error) === "SESSION_NOT_FRESH") {
        setReauthenticationOpen(true)
        return
      }
      toast.error(safeAuthErrorMessage(error, passkeyRegistrationFallback))
    },
  })
  const { mutate } = mutation
  const register = useCallback(
    () => mutate({ name: "Enterprise Agentic SaaS" }),
    [mutate]
  )
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
  const resumePasskeyRegistration = useEffectEvent(() => {
    mutate({ name: "Enterprise Agentic SaaS" })
  })

  useEffect(() => {
    if (!consumePendingPasskeyAction()) return
    resumePasskeyRegistration()
  }, [])

  return {
    continueReauthentication,
    handleReauthenticationOpenChange,
    mutation,
    reauthenticationOpen,
    register,
    triggerRef,
  }
}
