"use client"

import { createAuthClientForBaseUrl } from "@enterprise-agentic-saas/auth/client"
import { Toaster } from "@enterprise-agentic-saas/ui/components/sonner"
import { TooltipProvider } from "@enterprise-agentic-saas/ui/components/tooltip"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Provider as JotaiProvider } from "jotai"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import { useCallback, useState, type PropsWithChildren } from "react"

import { ThemeProvider } from "@/components/theme-provider/theme-provider"
import { AuthProvider, magicLinkPlugin } from "@/features/auth"
import { shouldRetryConsoleQuery } from "@/features/console"
import { clientEnv } from "@/lib/env.client"

const authBasePaths = {
  auth: "/auth",
  settings: "/settings",
  organization: "/organization",
} as const

const socialProviders: Array<"github"> = ["github"]
const emailAndPassword = { enabled: false } as const
const authPlugins = [magicLinkPlugin()]

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryConsoleQuery,
        staleTime: 30_000,
      },
    },
  })

export const Providers = ({ children }: PropsWithChildren) => {
  const router = useRouter()
  const [queryClient] = useState(createQueryClient)
  const [authClient] = useState(() =>
    createAuthClientForBaseUrl(clientEnv.NEXT_PUBLIC_API_BASE_URL)
  )
  const navigate = useCallback(
    ({ to, replace }: { to: string; replace?: boolean }) => {
      if (replace) {
        router.replace(to)
        return
      }

      router.push(to)
    },
    [router]
  )

  return (
    <NuqsAdapter>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider>
          <AuthProvider
            authClient={authClient}
            baseURL={clientEnv.NEXT_PUBLIC_API_BASE_URL}
            basePaths={authBasePaths}
            queryClient={queryClient}
            socialProviders={socialProviders}
            emailAndPassword={emailAndPassword}
            plugins={authPlugins}
            Link={Link}
            navigate={navigate}
          >
            <ThemeProvider>
              <TooltipProvider delay={350}>{children}</TooltipProvider>
            </ThemeProvider>
            <Toaster />
          </AuthProvider>
        </JotaiProvider>
      </QueryClientProvider>
    </NuqsAdapter>
  )
}
