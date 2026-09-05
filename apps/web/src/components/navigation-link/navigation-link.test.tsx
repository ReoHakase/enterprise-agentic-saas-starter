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
import { describe, expect, test, vi } from "vitest"

import {
  DropdownMenuLinkItem,
  NavigationLinkBridge,
  SidebarMenuLinkButton,
} from "@/components/navigation-link/navigation-link"
import { TestRouterProvider } from "@/test-support/tanstack-router"

describe("NavigationLinkのadapter契約", () => {
  test("Given prefetchを無効にする, When linkを描画する, Then DOMへ未知属性を渡さない", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)

    render(
      <TestRouterProvider>
        <NavigationLinkBridge href="/auth/sign-up" prefetch={false}>
          Sign up
        </NavigationLinkBridge>
      </TestRouterProvider>
    )

    const link = await screen.findByRole("link", { name: "Sign up" })
    expect(link).toHaveAttribute("href", "/auth/sign-up")
    expect(link).not.toHaveAttribute("prefetch")
    expect(consoleError).not.toHaveBeenCalled()
  })

  test("要求されたサイドバーの遷移先を保持する", async () => {
    render(
      <TestRouterProvider>
        <SidebarProvider>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuLinkButton href="/organization/acme/issues">
                Issues
              </SidebarMenuLinkButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarProvider>
      </TestRouterProvider>
    )

    expect(await screen.findByRole("link", { name: "Issues" })).toHaveAttribute(
      "href",
      "/organization/acme/issues"
    )
  })

  test("要求されたメニューの遷移先を保持する", async () => {
    const user = userEvent.setup()
    render(
      <TestRouterProvider>
        <DropdownMenu>
          <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLinkItem href="/settings/account">
              Account settings
            </DropdownMenuLinkItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TestRouterProvider>
    )

    await user.click(await screen.findByRole("button", { name: "Open menu" }))

    expect(
      await screen.findByRole("menuitem", { name: "Account settings" })
    ).toHaveAttribute("href", "/settings/account")
  })
})
