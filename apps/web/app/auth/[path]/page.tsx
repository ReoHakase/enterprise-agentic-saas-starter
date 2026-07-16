import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { Auth } from "@/components/auth/auth"
import { AuthRouteScope } from "@/components/auth/auth-route-scope"
import { AuthRouteFrame } from "@/components/public-route-frame"
import { sanitizeAuthRedirectTo } from "@/lib/auth/redirect-to"

type AuthPageProps = {
  params: Promise<{
    path: string
  }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const metadata: Metadata = {
  title: "Authentication",
  description: "Sign in or create an account for your team workspace.",
}

export default async function AuthPage({
  params,
  searchParams,
}: AuthPageProps) {
  const [{ path }, query] = await Promise.all([params, searchParams])
  const addingAccount = query.add_account === "1"
  const reauthenticating = query.reauth === "1"
  const requestedRedirect = Array.isArray(query.redirectTo)
    ? query.redirectTo[0]
    : query.redirectTo
  const safeRedirect = sanitizeAuthRedirectTo(requestedRedirect)

  if (requestedRedirect) {
    if (safeRedirect !== requestedRedirect) {
      const safeQuery = new URLSearchParams({ redirectTo: safeRedirect })
      if (addingAccount) {
        safeQuery.set("add_account", "1")
      }
      if (reauthenticating) {
        safeQuery.set("reauth", "1")
      }
      redirect(`/auth/${encodeURIComponent(path)}?${safeQuery.toString()}`)
    }
  }

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
        redirectTo={safeRedirect}
      >
        <Auth className="w-full max-w-none" path={path} />
      </AuthRouteScope>
    </AuthRouteFrame>
  )
}
