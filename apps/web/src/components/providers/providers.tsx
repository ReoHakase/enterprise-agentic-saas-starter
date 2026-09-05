"use client"

import { createAuthClientForBaseUrl } from "@enterprise-agentic-saas/auth/client"
import { Toaster } from "@enterprise-agentic-saas/ui/components/sonner"
import { TooltipProvider } from "@enterprise-agentic-saas/ui/components/tooltip"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { Provider as JotaiProvider } from "jotai"
import { NuqsAdapter } from "nuqs/adapters/tanstack-router"
import { useCallback, useState, type PropsWithChildren } from "react"

import { NavigationLinkBridge } from "@/components/navigation-link/navigation-link"
import { ThemeProvider } from "@/components/theme-provider/theme-provider"
import { AuthProvider, magicLinkPlugin } from "@/features/auth"
import { clientEnv } from "@/lib/env"

const authBasePaths = {
  auth: "/auth",
  settings: "/settings",
  organization: "/organization",
} as const

const socialProviders: Array<"github"> = ["github"]
const emailAndPassword = { enabled: false } as const
const authPlugins = [magicLinkPlugin()]

export const Providers = ({ children }: PropsWithChildren) => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [authClient] = useState(() =>
    createAuthClientForBaseUrl(clientEnv.VITE_API_BASE_URL)
  )
  const navigate = useCallback(
    ({ to, replace }: { to: string; replace?: boolean }) => {
      if (replace) {
        void router.navigate({ replace: true, to })
        return
      }

      void router.navigate({ to })
    },
    [router]
  )

  return (
    <NuqsAdapter>
      <JotaiProvider>
        <AuthProvider
          authClient={authClient}
          baseURL={clientEnv.VITE_API_BASE_URL}
          basePaths={authBasePaths}
          queryClient={queryClient}
          socialProviders={socialProviders}
          emailAndPassword={emailAndPassword}
          plugins={authPlugins}
          Link={NavigationLinkBridge}
          navigate={navigate}
        >
          <ThemeProvider>
            <TooltipProvider delay={350}>{children}</TooltipProvider>
          </ThemeProvider>
          <Toaster />
        </AuthProvider>
      </JotaiProvider>
    </NuqsAdapter>
  )
}
