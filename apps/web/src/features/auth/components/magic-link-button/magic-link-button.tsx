"use client"

import { type AuthView, authMutationKeys } from "@better-auth-ui/core"
import { magicLinkPlugin as coreMagicLinkPlugin } from "@better-auth-ui/core/plugins"
import { useAuth, useAuthPlugin } from "@better-auth-ui/react"
import {
  Button,
  buttonVariants,
} from "@enterprise-agentic-saas/ui/components/button"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { useIsMutating } from "@tanstack/react-query"
import { Lock, Mail } from "lucide-react"

import { createScopedAuthViewHref } from "../auth-route-scope/auth-route-href"
import { useAuthRouteState } from "../auth-route-scope/auth-route-scope"

export type MagicLinkButtonProps = {
  /** @remarks `AuthView` */
  view?: AuthView
}

/**
 * Toggle button between the password sign-in and magic-link routes.
 *
 * @param view - Current auth view. On `"magicLink"` this links back to password sign-in.
 */
export function MagicLinkButton({ view }: MagicLinkButtonProps) {
  const { basePaths, emailAndPassword, viewPaths, localization, Link } =
    useAuth()
  const authRoute = useAuthRouteState()

  const signInMutating = useIsMutating({
    mutationKey: authMutationKeys.signIn.all,
  })
  const signUpMutating = useIsMutating({
    mutationKey: authMutationKeys.signUp.all,
  })
  const isPending = signInMutating + signUpMutating > 0

  const { localization: magicLinkLocalization, viewPaths: magicLinkViewPaths } =
    useAuthPlugin(coreMagicLinkPlugin)

  const isMagicLinkView = view === "magicLink"

  // On the magic-link view this button switches back to password sign-in.
  // With password auth disabled there's nowhere to switch to, so hide it.
  // (Other views — e.g. a phone-number plugin's surface — still get a
  // "Continue with Magic Link" link.)
  if (isMagicLinkView && !emailAndPassword?.enabled) return null

  const href = createScopedAuthViewHref({
    basePath: basePaths.auth,
    preserveReauthentication: true,
    route: authRoute,
    viewPath: isMagicLinkView
      ? viewPaths.auth.signIn
      : magicLinkViewPaths.auth.magicLink,
  })
  const label = localization.auth.continueWith.replace(
    "{{provider}}",
    isMagicLinkView
      ? localization.auth.password
      : magicLinkLocalization.magicLink
  )
  const content = (
    <>
      {isMagicLinkView ? <Lock /> : <Mail />}
      {label}
    </>
  )

  if (isPending) {
    return (
      <Button type="button" variant="outline" className="w-full" disabled>
        {content}
      </Button>
    )
  }

  return (
    <Link
      href={href}
      className={cn(buttonVariants({ variant: "outline" }), "w-full")}
    >
      {content}
    </Link>
  )
}
