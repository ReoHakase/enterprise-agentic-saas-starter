import { HeadContent, Scripts } from "@tanstack/react-router"
import type { CSSProperties, ReactNode } from "react"

import { Providers } from "@/components/providers/providers"

type FontVariables = CSSProperties & {
  "--font-inter": string
  "--font-mono": string
}

const fontVariables: FontVariables = {
  "--font-inter": '"Inter Variable"',
  "--font-mono": '"Geist Mono Variable"',
}

export const RootDocument = ({
  children,
}: Readonly<{ children: ReactNode }>) => (
  <html
    lang="en"
    suppressHydrationWarning
    className="font-sans antialiased"
    style={fontVariables}
  >
    <head>
      <HeadContent />
    </head>
    <body className="min-h-svh">
      <Providers>{children}</Providers>
      <Scripts />
    </body>
  </html>
)
