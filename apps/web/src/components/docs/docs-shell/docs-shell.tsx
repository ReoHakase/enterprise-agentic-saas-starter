import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  SidebarInset,
} from "@enterprise-agentic-saas/ui/components/sidebar"
import FumaLink from "fumadocs-core/link"
import type { Root } from "fumadocs-core/page-tree"
import { BookOpenIcon, LayoutDashboardIcon } from "lucide-react"
import type { ReactNode } from "react"

import { SidebarMenuLinkButton } from "@/components/navigation-link/navigation-link"

import { DocsSearch } from "../docs-search/docs-search"
import { DocsSidebar } from "../docs-sidebar/docs-sidebar"

export const DocsShell = ({
  children,
  tree,
}: {
  children: ReactNode
  tree: Root
}) => (
  <SidebarProvider open data-docs-shell="true">
    <Sidebar collapsible="offcanvas" variant="inset">
      <SidebarHeader className="gap-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuLinkButton
              href="/docs"
              size="lg"
              tooltip="Documentation"
            >
              <span className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
                <BookOpenIcon aria-hidden="true" />
              </span>
              <span className="grid min-w-0 flex-1 text-left">
                <span className="truncate font-semibold">Documentation</span>
                <span className="truncate text-xs text-muted-foreground">
                  Enterprise SaaS
                </span>
              </span>
            </SidebarMenuLinkButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <DocsSearch />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />
      <SidebarContent>
        <DocsSidebar tree={tree} />
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuLinkButton
              href="/dashboard"
              tooltip="Open App"
              data-docs-open-app
            >
              <LayoutDashboardIcon aria-hidden="true" />
              <span>Open App</span>
            </SidebarMenuLinkButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>

    <SidebarInset>
      <header className="sticky top-0 z-10 flex min-h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
        <SidebarTrigger className="md:hidden" />
        <FumaLink
          href="/docs"
          className="truncate text-sm font-semibold text-foreground md:hidden"
        >
          Documentation
        </FumaLink>
      </header>
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-10">
        {children}
      </main>
    </SidebarInset>
  </SidebarProvider>
)
