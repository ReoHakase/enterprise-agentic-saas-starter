import {
  LayoutDashboardIcon,
  ListChecksIcon,
  UsersRoundIcon,
} from "lucide-react"

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
} from "./sidebar-structure/sidebar-structure"
import {
  Sidebar,
  SidebarMenuButton,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "./sidebar/sidebar"

const WorkspaceNavigation = () => (
  <div className="h-96 w-[min(60rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border">
    <SidebarProvider className="min-h-full">
      <Sidebar collapsible="icon" className="absolute h-96">
        <SidebarHeader>
          <strong>Acme Cloud</strong>
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
        <SidebarFooter>Avery Stone · Owner</SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-h-full">
        <header className="flex h-14 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <span>Overview</span>
        </header>
        <div className="p-5">18 open issues · 24 active members</div>
      </SidebarInset>
    </SidebarProvider>
  </div>
)

const meta = preview.meta({
  title: "Workflows/Navigation",
  component: WorkspaceNavigation,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
})

export const ResponsiveWorkspace = meta.story({})
