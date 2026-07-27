import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { OrganizationRole } from "../../schema"
import { OrganizationRoleBadge } from "./organization-role-badge"

describe("OrganizationRoleBadge", () => {
  it.each([
    ["super_admin", "Super Admin", "lucide-crown"],
    ["admin", "Admin", "lucide-shield"],
    ["member", "Member", "lucide-user-round"],
  ] satisfies ReadonlyArray<
    [role: OrganizationRole, label: string, iconClass: string]
  >)("renders the %s role contract", (role, label, iconClass) => {
    render(<OrganizationRoleBadge role={role} />)

    const badge = screen.getByTestId(`organization-role-${role}`)
    expect(badge).toHaveAttribute("data-slot", "badge")
    expect(badge).toHaveTextContent(label)

    const icon = screen.getByTestId(`role-icon-${role}`)
    expect(badge).toContainElement(icon)
    expect(icon).toHaveClass(iconClass)
    expect(icon).toHaveAttribute("aria-hidden", "true")
  })
})
