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
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test } from "vitest"

import {
  DropdownMenuLinkItem,
  SidebarMenuLinkButton,
} from "@/components/navigation-link/navigation-link"

describe("navigation link adapters", () => {
  test("preserves the requested sidebar destination", () => {
    render(
      <SidebarProvider>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuLinkButton href="/organization/acme/issues">
              Issues
            </SidebarMenuLinkButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarProvider>
    )

    expect(screen.getByRole("link", { name: "Issues" })).toHaveAttribute(
      "href",
      "/organization/acme/issues"
    )
  })

  test("preserves the requested menu destination", async () => {
    const user = userEvent.setup()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLinkItem href="/settings/account">
            Account settings
          </DropdownMenuLinkItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )

    await user.click(screen.getByRole("button", { name: "Open menu" }))

    expect(
      await screen.findByRole("menuitem", { name: "Account settings" })
    ).toHaveAttribute("href", "/settings/account")
  })
})
