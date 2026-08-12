import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { BlocksIcon } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

export type AuthRouteFrameSize = "default" | "oauth"

export const AuthRouteFrame = ({
  status,
  children,
  size = "default",
}: {
  status?: ReactNode
  children: ReactNode
  size?: AuthRouteFrameSize
}) => (
  <main
    data-slot="auth-frame"
    className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10"
  >
    <div
      className={cn(
        "flex flex-col gap-6",
        size === "oauth" ? "min-w-0" : "w-full max-w-sm"
      )}
    >
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
        className={cn(
          "flex min-h-128 min-w-0 items-start *:data-[slot=card]:min-h-128",
          size === "default" && "w-full *:data-[slot=card]:w-full"
        )}
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
