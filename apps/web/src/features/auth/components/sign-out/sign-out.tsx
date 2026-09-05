"use client"

import { useAuth, useSignOut } from "@better-auth-ui/react"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { useEffect, useRef } from "react"
import { toast } from "sonner"

import { safeAuthErrorMessage } from "@/features/auth"

import { clearAuthenticatedQueryCache } from "../../query-cache"

export type SignOutProps = {
  className?: string
}

/**
 * Signs the current user out on mount and renders a centered spinner while the operation completes.
 *
 * @param className - Optional additional class names appended to the root element
 * @returns The spinner shown during sign-out
 */
export function SignOut({ className }: SignOutProps) {
  const { authClient, basePaths, navigate, viewPaths } = useAuth()
  const queryClient = useQueryClient()
  const router = useRouter()

  const { mutate: signOut } = useSignOut(authClient, {
    onError: (error) => {
      void router.invalidate()
      toast.error(safeAuthErrorMessage(error, "Sign out failed. Try again."))

      navigate({
        to: `${basePaths.auth}/${viewPaths.auth.signIn}`,
        replace: true,
      })
    },
    onSuccess: () => {
      navigate({
        to: `${basePaths.auth}/${viewPaths.auth.signIn}`,
        replace: true,
      })
    },
  })

  const hasSignedOut = useRef(false)

  useEffect(() => {
    if (hasSignedOut.current) return
    hasSignedOut.current = true

    void clearAuthenticatedQueryCache(queryClient).then(
      () => signOut(),
      () => signOut()
    )
  }, [queryClient, signOut])

  return <Spinner className={cn("m-auto", className)} />
}
