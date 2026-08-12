"use client"

import { authMutationKeys, getProviderName } from "@better-auth-ui/core"
import { providerIcons, useAuth, useSignInSocial } from "@better-auth-ui/react"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useIsMutating } from "@tanstack/react-query"
import type { SocialProvider } from "better-auth/social-providers"
import { type ComponentProps, useCallback } from "react"
import { toast } from "sonner"

import { safeAuthErrorMessage } from "@/features/auth"
import { useIsHydrated } from "@/hooks/use-is-hydrated"

import { createAuthCallbackURL } from "../../callback-url"
import { useAuthRouteState } from "../auth-route-scope/auth-route-scope"

export type ProviderButtonProps = {
  provider: SocialProvider
  display?: "full" | "name" | "icon"
} & Omit<ComponentProps<typeof Button>, "onClick" | "children" | "disabled">

/**
 * Social provider sign-in button.
 *
 * @param provider - Provider to sign in with.
 * @param display - `"full"` (e.g. "Continue with Google"), `"name"` (just the provider name), or `"icon"` (icon only).
 */
export function ProviderButton({
  provider,
  display = "full",
  variant = "outline",
  ...props
}: ProviderButtonProps) {
  const { authClient, localization, redirectTo: defaultRedirectTo } = useAuth()
  const authRoute = useAuthRouteState()
  const hydrated = useIsHydrated()
  const redirectTo = authRoute?.redirectTo ?? defaultRedirectTo

  const callbackURL = createAuthCallbackURL(redirectTo)

  const { mutate: signInSocial, isPending: signInSocialPending } =
    useSignInSocial(authClient, {
      onError: (error) => {
        toast.error(
          safeAuthErrorMessage(
            error,
            `${getProviderName(provider)} sign-in could not be started. Try again.`
          )
        )
      },
    })

  const ProviderIcon = providerIcons[provider]

  const signInMutating = useIsMutating({
    mutationKey: authMutationKeys.signIn.all,
  })
  const signUpMutating = useIsMutating({
    mutationKey: authMutationKeys.signUp.all,
  })
  const isPending = signInMutating + signUpMutating > 0
  const handleSignIn = useCallback(
    () => signInSocial({ provider, callbackURL }),
    [callbackURL, provider, signInSocial]
  )

  return (
    <Button
      type="button"
      variant={variant}
      disabled={isPending || !hydrated}
      onClick={handleSignIn}
      {...props}
      aria-label={getProviderName(provider)}
    >
      {signInSocialPending ? (
        <Spinner />
      ) : ProviderIcon ? (
        <ProviderIcon />
      ) : null}

      {display === "full"
        ? localization.auth.continueWith.replace(
            "{{provider}}",
            getProviderName(provider)
          )
        : display === "name"
          ? getProviderName(provider)
          : null}
    </Button>
  )
}
