"use client"

import { useAuth } from "@better-auth-ui/react"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { KeyRoundIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import { toast } from "sonner"

import { requirePasskeyAuthClient } from "./runtime-guards"

export function PasskeySignInButton() {
  const { authClient, redirectTo } = useAuth()
  const router = useRouter()
  const [pending, setPending] = useState(false)

  const signInWithPasskey = useCallback(async () => {
    setPending(true)
    try {
      await requirePasskeyAuthClient(authClient).signIn.passkey({
        fetchOptions: {
          onSuccess: () => router.push(redirectTo),
          onError: ({ error }) => {
            toast.error(error.message ?? "Passkey sign-in failed")
          },
        },
      })
    } catch {
      toast.error("Passkey sign-in failed")
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
