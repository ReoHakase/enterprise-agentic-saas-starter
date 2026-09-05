import type { AuthView } from "@better-auth-ui/core"
import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { createFileRoute, redirect } from "@tanstack/react-router"

import { AuthRouteFrame } from "@/components/public-route-frame/public-route-frame"
import { AuthRouteLoading } from "@/components/public-route-suspense/public-route-suspense"
import {
  Auth,
  AuthRouteScope,
  resolveAuthRouteView,
  sanitizeAuthRedirectTo,
} from "@/features/auth"
import {
  parseMcpOAuthSearchParams,
  resolveMcpOAuthLoginRedirect,
} from "@/features/mcp-oauth"

import { AuthRouteError } from "../-route-boundaries"

type AuthRouteData = {
  addingAccount: boolean
  reauthenticating: boolean
  redirectTo: string
  view: AuthView
}

const loadAuthRoute = ({
  path,
  search,
}: {
  path: string
  search: string
}): AuthRouteData => {
  const query = parseMcpOAuthSearchParams(search)
  const addingAccount = query.add_account === "1"
  const reauthenticating = query.reauth === "1"
  const requestedRedirect =
    resolveMcpOAuthLoginRedirect(query, search) ??
    (Array.isArray(query.redirectTo) ? query.redirectTo[0] : query.redirectTo)
  const redirectTo = sanitizeAuthRedirectTo(requestedRedirect)

  if (requestedRedirect && redirectTo !== requestedRedirect) {
    const safeQuery = new URLSearchParams({ redirectTo })
    if (addingAccount) safeQuery.set("add_account", "1")
    if (reauthenticating) safeQuery.set("reauth", "1")

    throw redirect({
      href: `/auth/${encodeURIComponent(path)}?${safeQuery.toString()}`,
    })
  }

  return {
    addingAccount,
    reauthenticating,
    redirectTo,
    view: resolveAuthRouteView(path),
  }
}

const AuthPage = () => {
  const { addingAccount, reauthenticating, redirectTo, view } =
    Route.useLoaderData()
  const status =
    addingAccount || reauthenticating ? (
      <>
        {addingAccount ? (
          <div
            data-slot="auth-context-status"
            className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm"
          >
            <span className="min-w-0">
              Sign in with another account. Your current account stays on this
              device.
            </span>
            <Badge variant="secondary">Add account</Badge>
          </div>
        ) : null}

        {reauthenticating ? (
          <div
            data-slot="auth-context-status"
            role="status"
            className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm"
          >
            <span className="min-w-0">
              Sign in again to confirm this security-sensitive change.
            </span>
            <Badge variant="secondary">Security check</Badge>
          </div>
        ) : null}
      </>
    ) : undefined

  return (
    <AuthRouteFrame status={status}>
      <AuthRouteScope
        addingAccount={addingAccount}
        reauthenticating={reauthenticating}
        redirectTo={redirectTo}
      >
        <Auth className="w-full max-w-none" view={view} />
      </AuthRouteScope>
    </AuthRouteFrame>
  )
}

export const Route = createFileRoute("/(public)/auth/$path")({
  loader: ({ location, params }) =>
    loadAuthRoute({ path: params.path, search: location.searchStr }),
  head: () => ({
    meta: [
      { title: "Authentication · Enterprise SaaS" },
      {
        content: "Sign in or create an account for your team workspace.",
        name: "description",
      },
    ],
  }),
  headers: () => ({ "Cache-Control": "no-store" }),
  component: AuthPage,
  errorComponent: AuthRouteError,
  pendingComponent: AuthRouteLoading,
})
