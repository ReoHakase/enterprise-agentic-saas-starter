import {
  LayoutDashboardIcon,
  ListChecksIcon,
  UsersRoundIcon,
} from "lucide-react"
import { expect, userEvent, within } from "storybook/test"

import preview from "#storybook/preview"

import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
} from "../sidebar-structure/sidebar-structure"
import {
  Sidebar,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "./sidebar"

const WorkspaceSidebar = () => (
  <div className="h-96 w-[min(56rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border">
    <SidebarProvider className="min-h-full" defaultOpen>
      <Sidebar
        data-testid="workspace-sidebar"
        collapsible="icon"
        className="absolute h-96"
      >
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" tooltip="Acme Cloud">
                <span className="flex size-8 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
                  A
                </span>
                <span>Acme Cloud</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive tooltip="Overview">
                    <LayoutDashboardIcon aria-hidden="true" />
                    <span>Overview</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>3</SidebarMenuBadge>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Issues">
                    <ListChecksIcon aria-hidden="true" />
                    <span>Issues</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Members">
                    <UsersRoundIcon aria-hidden="true" />
                    <span>Members</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>Avery Stone</SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-h-full">
        <header className="flex h-14 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <span className="font-medium">Overview</span>
        </header>
        <div className="p-5">18 open issues</div>
      </SidebarInset>
    </SidebarProvider>
  </div>
)

const meta = preview.meta({
  title: "Components/Sidebar",
  component: WorkspaceSidebar,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
})

export const ExpandedAndCollapsed = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvasElement, step }) => {
    const sidebar = canvasElement.querySelector(
      '[data-slot="sidebar"][data-state]'
    )
    if (!sidebar) throw new Error("Sidebar state container was not rendered")

    await step("Collapse and expand with Control+B", async () => {
      await expect(sidebar).toHaveAttribute("data-state", "expanded")
      await expect(
        within(canvasElement).getByRole("button", { name: "Overview" })
      ).toBeVisible()
      await userEvent.keyboard("{Control>}b{/Control}")
      await expect(sidebar).toHaveAttribute("data-state", "collapsed")
      await userEvent.keyboard("{Control>}b{/Control}")
      await expect(sidebar).toHaveAttribute("data-state", "expanded")
    })
  },
})

export const IconMode = meta.story({
  render: () => <WorkspaceSidebar />,
  play: async ({ canvasElement }) => {
    await userEvent.keyboard("{Control>}b{/Control}")
    await expect(
      canvasElement.querySelector('[data-slot="sidebar"][data-state]')
    ).toHaveAttribute("data-state", "collapsed")
  },
})
