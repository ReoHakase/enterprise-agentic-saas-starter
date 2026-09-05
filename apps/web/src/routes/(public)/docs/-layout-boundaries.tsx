import type { ErrorComponentProps } from "@tanstack/react-router"
import { TanstackProvider } from "fumadocs-core/framework/tanstack"
import type { Root } from "fumadocs-core/page-tree"
import type { ReactNode } from "react"

import { NavigationLinkBridge } from "@/components/navigation-link/navigation-link"
import { Shell } from "@/features/docs"

import { DocsRouteError, DocsRouteLoading } from "./-page"

const emptyDocsTree = {
  children: [],
  name: "Documentation",
  type: "root",
} satisfies Root
const emptySearchPages: [] = []

const DocsLayoutBoundaryShell = ({
  children,
  state,
}: {
  children: ReactNode
  state: "error" | "loading"
}) => (
  <TanstackProvider Link={NavigationLinkBridge}>
    <Shell boundaryState={state} pages={emptySearchPages} tree={emptyDocsTree}>
      {children}
    </Shell>
  </TanstackProvider>
)

export const DocsLayoutLoading = () => (
  <DocsLayoutBoundaryShell state="loading">
    <DocsRouteLoading />
  </DocsLayoutBoundaryShell>
)

export const DocsLayoutError = (props: ErrorComponentProps) => (
  <DocsLayoutBoundaryShell state="error">
    <DocsRouteError {...props} />
  </DocsLayoutBoundaryShell>
)
