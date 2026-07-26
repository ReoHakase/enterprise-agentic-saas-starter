import { cn } from "@enterprise-agentic-saas/ui/lib/utils"

import "@enterprise-agentic-saas/ui/globals.css"
import type { Metadata, Viewport } from "next"

import { Providers } from "@/components/providers/providers"

import { fontMono, inter } from "./fonts"

export const metadata: Metadata = {
  title: {
    default: "Enterprise SaaS",
    template: "%s · Enterprise SaaS",
  },
  description:
    "A secure multi-tenant workspace for organizations, members, and issues.",
  applicationName: "Enterprise SaaS",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body className="min-h-svh">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
