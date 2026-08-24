import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { OrganizationInvitationStatus } from "../../schema"
import { InvitationStatusBadge } from "./invitation-status-badge"

describe("招待statusの表示", () => {
  it.each([
    ["pending", "Pending"],
    ["accepted", "Accepted"],
    ["rejected", "Rejected"],
    ["expired", "Expired"],
    ["canceled", "Canceled"],
  ] satisfies ReadonlyArray<
    [status: OrganizationInvitationStatus, label: string]
  >)("statusが%sなら対応する表示名を公開する", (status, label) => {
    render(<InvitationStatusBadge status={status} />)

    expect(screen.getByText(label)).toBeVisible()
  })
})
