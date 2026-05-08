"use client"

import { createAuthClientForBaseUrl } from "@enterprise-agentic-saas/auth/client"
import { Toaster } from "@enterprise-agentic-saas/ui/components/sonner"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type PropsWithChildren } from "react"

import { AuthProvider } from "@/components/auth/auth-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { magicLinkPlugin } from "@/lib/auth/magic-link-plugin"
import { clientEnv } from "@/lib/env.client"

export const Providers = ({ children }: PropsWithChildren) => {
  const router = useRouter()
  const [queryClient] = useState(() => new QueryClient())
  const [authClient] = useState(() =>
    createAuthClientForBaseUrl(clientEnv.NEXT_PUBLIC_API_BASE_URL)
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider
        authClient={authClient}
        baseURL={clientEnv.NEXT_PUBLIC_API_BASE_URL}
        // oxlint-disable-next-line react_perf/jsx-no-new-object-as-prop
        basePaths={{
          auth: "/auth",
          settings: "/settings",
          organization: "/organization",
        }}
        queryClient={queryClient}
        // oxlint-disable-next-line react_perf/jsx-no-new-array-as-prop
        socialProviders={["github"]}
        // oxlint-disable-next-line react_perf/jsx-no-new-object-as-prop
        emailAndPassword={{ enabled: false }}
        // oxlint-disable-next-line react_perf/jsx-no-new-array-as-prop
        plugins={[magicLinkPlugin()]}
        Link={Link}
        // oxlint-disable-next-line react_perf/jsx-no-new-function-as-prop
        navigate={({ to, replace }) => {
          if (replace) {
            router.replace(to)
            return
          }

          router.push(to)
        }}
      >
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  )
}
