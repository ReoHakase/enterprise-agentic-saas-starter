import { SettingsIcon, ShieldCheckIcon } from "lucide-react"

import preview from "#storybook/preview"

import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "./sidebar-structure"

const meta = preview.meta({
  title: "Components/Sidebar Structure",
  component: SidebarContent,
  tags: ["autodocs"],
})

export const NavigationStructure = meta.story({
  render: () => (
    <aside
      aria-label="Acme Cloud settings"
      className="flex h-96 w-64 flex-col bg-sidebar text-sidebar-foreground"
    >
      <SidebarHeader>
        <strong>Acme Cloud</strong>
        <SidebarInput aria-label="Search settings" placeholder="Search" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Administration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <a className="flex items-center gap-2 p-2" href="#general">
                  <SettingsIcon aria-hidden="true" /> General
                </a>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <span className="flex items-center gap-2 p-2">
                  <ShieldCheckIcon aria-hidden="true" /> Security
                </span>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton href="#access" isActive>
                      Access policies
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>Avery Stone · Owner</SidebarFooter>
    </aside>
  ),
})
