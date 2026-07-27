import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { OrganizationInvitationStatus } from "../../schema"
import { InvitationStatusBadge } from "./invitation-status-badge"

describe("InvitationStatusBadge", () => {
  it.each([
    ["pending", "Pending", "lucide-clock-3"],
    ["accepted", "Accepted", "lucide-circle-check"],
    ["rejected", "Rejected", "lucide-circle-x"],
    ["expired", "Expired", "lucide-clock-alert"],
    ["canceled", "Canceled", "lucide-ban"],
  ] satisfies ReadonlyArray<
    [status: OrganizationInvitationStatus, label: string, iconClass: string]
  >)("renders the %s status contract", (status, label, iconClass) => {
    render(<InvitationStatusBadge status={status} />)

    const badge = screen.getByTestId(`invitation-status-${status}`)
    expect(badge).toHaveAttribute("data-slot", "badge")
    expect(badge).toHaveTextContent(label)

    const icon = screen.getByTestId(`status-icon-${status}`)
    expect(badge).toContainElement(icon)
    expect(icon).toHaveClass(iconClass)
    expect(icon).toHaveAttribute("aria-hidden", "true")
  })
})
