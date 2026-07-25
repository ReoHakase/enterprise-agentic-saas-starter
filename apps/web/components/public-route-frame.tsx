import { BlocksIcon } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

export const AuthRouteFrame = ({
  status,
  children,
}: {
  status?: ReactNode
  children: ReactNode
}) => (
  <main
    data-slot="auth-frame"
    className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10"
  >
    <div className="flex w-full max-w-sm flex-col gap-6">
      <Link
        href="/"
        prefetch={false}
        className="flex items-center gap-2 self-center font-medium"
      >
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <BlocksIcon aria-hidden="true" />
        </span>
        Enterprise SaaS
      </Link>

      {status}

      <div
        data-slot="auth-panel"
        className="flex min-h-128 w-full items-start *:data-[slot=card]:min-h-128 *:data-[slot=card]:w-full"
      >
        {children}
      </div>

      <p className="px-6 text-center text-xs text-foreground/70">
        By continuing, you agree to the workspace terms and acknowledge the
        privacy policy.
      </p>
    </div>
  </main>
)

export const InvitationRouteFrame = ({ children }: { children: ReactNode }) => (
  <main
    data-slot="invitation-frame"
    className="flex min-h-svh items-center justify-center p-6"
  >
    {children}
  </main>
)
