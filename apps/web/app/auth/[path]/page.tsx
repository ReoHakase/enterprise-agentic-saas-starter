import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { BlocksIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { Auth } from "@/components/auth/auth"
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

  if (requestedRedirect) {
    const safeRedirect = sanitizeAuthRedirectTo(requestedRedirect)
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

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 self-center font-medium"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BlocksIcon aria-hidden="true" />
          </span>
          Enterprise SaaS
        </Link>

        {addingAccount ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
            <span className="min-w-0">
              Sign in with another account. Your current account stays on this
              device.
            </span>
            <Badge variant="secondary">Add account</Badge>
          </div>
        ) : null}

        {reauthenticating ? (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm"
          >
            <span className="min-w-0">
              Sign in again to confirm this security-sensitive change.
            </span>
            <Badge variant="secondary">Security check</Badge>
          </div>
        ) : null}

        <Auth className="w-full max-w-none" path={path} />

        <p className="px-6 text-center text-xs text-muted-foreground">
          By continuing, you agree to the workspace terms and acknowledge the
          privacy policy.
        </p>
      </div>
    </main>
  )
}
