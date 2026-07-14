"use client"

import { useAuth } from "@better-auth-ui/react"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { KeyRoundIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import { toast } from "sonner"

import { safeAuthErrorMessage } from "@/features/auth/error"

import { requirePasskeyAuthClient } from "./runtime-guards"

const passkeySignInFallback = "Passkey sign-in failed. Try again."

export function PasskeySignInButton() {
  const { authClient, redirectTo } = useAuth()
  const router = useRouter()
  const [pending, setPending] = useState(false)

  const signInWithPasskey = useCallback(async () => {
    let errorPresented = false
    setPending(true)
    try {
      await requirePasskeyAuthClient(authClient).signIn.passkey({
        fetchOptions: {
          onSuccess: () => router.push(redirectTo),
          onError: ({ error }) => {
            errorPresented = true
            toast.error(safeAuthErrorMessage(error, passkeySignInFallback))
          },
        },
      })
    } catch {
      if (!errorPresented) toast.error(passkeySignInFallback)
    } finally {
      setPending(false)
    }
  }, [authClient, redirectTo, router])

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      disabled={pending}
      onClick={signInWithPasskey}
    >
      {pending ? <Spinner /> : <KeyRoundIcon aria-hidden="true" />}
      Sign in with passkey
    </Button>
  )
}
