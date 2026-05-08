"use client"

import { useAuth } from "@better-auth-ui/react"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { KeyRoundIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

type PasskeyAuthClient = {
  signIn: {
    passkey: (input?: {
      fetchOptions?: {
        onSuccess?: () => void
        onError?: (context: { error: { message?: string } }) => void
      }
    }) => Promise<unknown>
  }
}

export function PasskeySignInButton() {
  const { authClient, redirectTo } = useAuth()
  const router = useRouter()
  const [pending, setPending] = useState(false)

  const signInWithPasskey = async () => {
    setPending(true)
    try {
      await (authClient as unknown as PasskeyAuthClient).signIn.passkey({
        fetchOptions: {
          onSuccess: () => router.push(redirectTo),
          onError: ({ error }) => {
            toast.error(error.message ?? "Passkey sign-in failed")
          },
        },
      })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Passkey sign-in failed"
      )
    } finally {
      setPending(false)
    }
  }

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
