import { createFileRoute, Outlet } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { TanstackProvider } from "fumadocs-core/framework/tanstack"
import { useFumadocsLoader } from "fumadocs-core/source/client"
import { useMemo } from "react"

import { NavigationLinkBridge } from "@/components/navigation-link/navigation-link"
import { Shell } from "@/features/docs"
import { collectPageIcons } from "@/lib/docs/page-tree"
import { source } from "@/lib/docs/source.server"

import { DocsLayoutError, DocsLayoutLoading } from "./-layout-boundaries"

const loadDocsNavigation = createServerFn({ method: "GET" }).handler(
  async () => ({
    pageTree: await source.serializePageTree(source.getPageTree()),
    pages: source.getPages().map((page) => ({
      title: String(page.data.title),
      url: page.url,
    })),
  })
)

const DocsLayout = () => {
  const { pageTree, pages } = useFumadocsLoader(Route.useLoaderData())
  const searchPages = useMemo(() => {
    const pageIcons = collectPageIcons(pageTree.children)

    return pages.map((page) => ({
      icon: pageIcons.get(page.url),
      title: page.title,
      url: page.url,
    }))
  }, [pageTree.children, pages])

  return (
    <TanstackProvider Link={NavigationLinkBridge}>
      <Shell pages={searchPages} tree={pageTree}>
        <Outlet />
      </Shell>
    </TanstackProvider>
  )
}

export const Route = createFileRoute("/(public)/docs")({
  loader: () => loadDocsNavigation(),
  component: DocsLayout,
  errorComponent: DocsLayoutError,
  pendingComponent: DocsLayoutLoading,
  pendingMs: 0,
})
