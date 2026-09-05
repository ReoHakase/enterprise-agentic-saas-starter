import { Toaster } from "@enterprise-agentic-saas/ui/components/sonner"
import addonA11y from "@storybook/addon-a11y"
import addonDocs from "@storybook/addon-docs"
import addonThemes, { withThemeByClassName } from "@storybook/addon-themes"
import addonVitest from "@storybook/addon-vitest"
import { definePreview } from "@storybook/react-vite"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import addonMsw from "msw-storybook-addon"
import { setupWorker } from "msw/browser"
import { type ReactNode, useState } from "react"

import "@enterprise-agentic-saas/ui/globals.css"
import "./preview.css"

import { storybookApiHandlers } from "../src/test-support/storybook/api-handlers"
import { TestRouterProvider } from "../src/test-support/tanstack-router"

const WithQueryClient = ({ children }: { children: ReactNode }) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: Number.POSITIVE_INFINITY,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const isStorybookInternalRequest = (request: Request) => {
  const url = new URL(request.url)

  return (
    url.origin === "https://fonts.gstatic.com" ||
    url.pathname === "/iframe.html" ||
    url.pathname === "/index.json" ||
    url.pathname === "/project.json" ||
    url.pathname.startsWith("/@") ||
    url.pathname.startsWith("/sb-") ||
    url.pathname.startsWith("/node_modules/") ||
    url.pathname.startsWith("/src/")
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
        onUnhandledRequest(request) {
          if (isStorybookInternalRequest(request)) return

          const url = new URL(request.url)
          throw new Error(
            `Unhandled Storybook product request: ${request.method} ${url.pathname}`
          )
        },
      })
      return worker
    }),
  ],
  beforeEach({ msw }) {
    msw.use(...storybookApiHandlers)
  },
  decorators: [
    (Story, context) => (
      <TestRouterProvider
        key={context.id}
        initialEntry={context.parameters.routerInitialEntry ?? "/dashboard"}
      >
        <WithQueryClient>
          <div
            className="min-h-64 bg-background p-6 text-foreground"
            data-storybook-content-root
          >
            <Story />
          </div>
          {context.parameters.disableGlobalToaster ? null : <Toaster />}
        </WithQueryClient>
      </TestRouterProvider>
    ),
    withThemeByClassName({
      themes: {
        light: "light font-sans antialiased",
        dark: "dark font-sans antialiased",
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
