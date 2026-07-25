import addonA11y from "@storybook/addon-a11y"
import addonDocs from "@storybook/addon-docs"
import addonThemes, { withThemeByClassName } from "@storybook/addon-themes"
import addonVitest from "@storybook/addon-vitest"
import { definePreview } from "@storybook/nextjs-vite"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import addonMsw from "msw-storybook-addon"
import { setupWorker } from "msw/browser"
import type { ReactNode } from "react"

import "@enterprise-agentic-saas/ui/globals.css"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    },
  },
})

const WithQueryClient = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

const isStorybookInternalRequest = (request: Request) => {
  const url = new URL(request.url)

  return (
    request.destination !== "" ||
    url.pathname === "/iframe.html" ||
    url.pathname === "/index.json" ||
    url.pathname === "/project.json" ||
    url.pathname.startsWith("/@") ||
    url.pathname.startsWith("/sb-") ||
    url.pathname.startsWith("/node_modules/")
  )
}

export default definePreview({
  addons: [
    addonA11y(),
    addonDocs(),
    addonThemes(),
    addonVitest(),
    addonMsw(async () => {
      const worker = setupWorker()
      await worker.start({
        onUnhandledRequest(request, print) {
          if (!isStorybookInternalRequest(request)) {
            print.error()
          }
        },
      })
      return worker
    }),
  ],
  decorators: [
    (Story) => (
      <WithQueryClient>
        <div className="min-h-64 bg-background p-6 text-foreground">
          <Story />
        </div>
      </WithQueryClient>
    ),
    withThemeByClassName({
      themes: {
        light: "light",
        dark: "dark",
      },
      defaultTheme: "light",
    }),
  ],
  parameters: {
    a11y: {
      test: "error",
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: "fullscreen",
  },
})
