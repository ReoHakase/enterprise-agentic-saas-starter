"use client"

import { useAuth } from "@better-auth-ui/react"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { KeyRoundIcon } from "lucide-react"
import { useCallback, useState } from "react"
import { toast } from "sonner"

import { safeAuthErrorMessage } from "@/features/auth"
import { reportObservedError } from "@/lib/report-observed-error"

import { clearAuthenticatedQueryCache } from "../../query-cache"
import { requirePasskeyAuthClient } from "../../runtime-guards"
import { useAuthRouteState } from "../auth-route-scope/auth-route-scope"

const passkeySignInFallback = "Passkey sign-in failed. Try again."

export function PasskeySignInButton() {
  const { authClient, redirectTo: defaultRedirectTo } = useAuth()
  const authRoute = useAuthRouteState()
  const redirectTo = authRoute?.redirectTo ?? defaultRedirectTo
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const router = useRouter()
  const [pending, setPending] = useState(false)

  const signInWithPasskey = useCallback(async () => {
    let errorPresented = false
    setPending(true)
    try {
      await clearAuthenticatedQueryCache(queryClient)
      await requirePasskeyAuthClient(authClient).signIn.passkey({
        fetchOptions: {
          onSuccess: () => {
            void navigate({ to: redirectTo })
          },
          onError: ({ error }) => {
            errorPresented = true
            reportObservedError(error)
            void router.invalidate()
            toast.error(safeAuthErrorMessage(error, passkeySignInFallback))
          },
        },
      })
    } catch (error) {
      reportObservedError(error)
      if (!errorPresented) {
        void router.invalidate()
        toast.error(passkeySignInFallback)
      }
    } finally {
      setPending(false)
    }
  }, [authClient, navigate, queryClient, redirectTo, router])

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
