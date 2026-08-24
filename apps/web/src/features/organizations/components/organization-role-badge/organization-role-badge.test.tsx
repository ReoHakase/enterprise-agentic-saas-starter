import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { OrganizationRole } from "../../schema"
import { OrganizationRoleBadge } from "./organization-role-badge"

describe("組織roleの表示", () => {
  it.each([
    ["owner", "Owner"],
    ["admin", "Admin"],
    ["member", "Member"],
  ] satisfies ReadonlyArray<[role: OrganizationRole, label: string]>)(
    "roleが%sなら対応する表示名を公開する",
    (role, label) => {
      render(<OrganizationRoleBadge role={role} />)

      expect(screen.getByText(label)).toBeVisible()
    }
  )
})
