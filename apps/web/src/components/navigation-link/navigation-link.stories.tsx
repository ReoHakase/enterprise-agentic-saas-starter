import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@enterprise-agentic-saas/ui/components/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
} from "@enterprise-agentic-saas/ui/components/sidebar"
import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import { DropdownMenuLinkItem, SidebarMenuLinkButton } from "./navigation-link"

const menuTrigger = <Button variant="outline" />

const NavigationExample = () => (
  <SidebarProvider>
    <div className="grid gap-4">
      <DropdownMenu>
        <DropdownMenuTrigger render={menuTrigger}>
          Open navigation
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLinkItem href="/settings/account">
            Account
          </DropdownMenuLinkItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuLinkButton href="/organization/acme/members">
            Members
          </SidebarMenuLinkButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </div>
  </SidebarProvider>
)

const meta = preview.meta({
  title: "Web/Shared/Navigation Links",
  component: NavigationExample,
  tags: ["autodocs"],
})

export const MenuAndSidebar = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, canvasElement, step }) => {
    await step("Open the menu with the keyboard", async () => {
      const trigger = canvas.getByRole("button", { name: "Open navigation" })
      trigger.focus()
      await userEvent.keyboard("{Enter}")
      const account = await within(canvasElement.ownerDocument.body).findByRole(
        "menuitem",
        {
          name: "Account",
        }
      )
      await expect(account).toHaveAttribute("href", "/settings/account")
      await userEvent.keyboard("{Escape}")
      const body = within(canvasElement.ownerDocument.body)
      await waitFor(() =>
        expect(body.queryByRole("menu")).not.toBeInTheDocument()
      )
      await expect(trigger).toHaveFocus()
    })
  },
})
