import { SidebarProvider } from "@enterprise-agentic-saas/ui/components/sidebar"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { OrganizationSummary } from "@/features/organizations"

import { consoleNavigation as ConsoleNavigation } from "./console-shell-navigation"

vi.mock("next/navigation", () => ({
  usePathname: () => "/organization/acme/dashboard",
}))

const activeOrganization = {
  id: "org-acme",
  name: "Acme",
  slug: "acme",
  role: "admin",
  active: true,
  profileImage: null,
  memberCount: 3,
  memberProfileImages: [],
  permissions: {
    canEditOrganization: true,
    canInviteMembers: true,
    canManageMembers: true,
    canManageAdmins: true,
    canTransferOwnership: false,
  },
} satisfies OrganizationSummary

describe("ConsoleNavigation", () => {
  it("shows workspace routes without a dedicated Agent link", () => {
    render(
      <SidebarProvider>
        <ConsoleNavigation
          activeOrganization={activeOrganization}
          agentThread=""
        />
      </SidebarProvider>
    )

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/organization/acme/dashboard"
    )
    expect(screen.getByRole("link", { name: "Issues" })).toHaveAttribute(
      "href",
      "/organization/acme/issues"
    )
    expect(
      screen.queryByRole("link", { name: "Agent" })
    ).not.toBeInTheDocument()
  })
})
