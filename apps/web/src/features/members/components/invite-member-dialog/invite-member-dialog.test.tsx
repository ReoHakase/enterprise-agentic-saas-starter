import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { InviteMemberDialog } from "./invite-member-dialog"

describe("InviteMemberDialogの契約", () => {
  it("権限がない利用者には管理者の招待を許可しない", async () => {
    const actor = userEvent.setup()
    render(
      <InviteMemberDialog
        canInviteAdmins={false}
        pending={false}
        onInvite={vi.fn<
          (input: {
            email: string
            role: "admin" | "member"
          }) => Promise<unknown>
        >()}
      />
    )

    await actor.click(screen.getByRole("button", { name: "Invite member" }))
    await actor.click(screen.getByRole("combobox", { name: "Invitation role" }))

    expect(screen.getByRole("option", { name: "Admin" })).toHaveAttribute(
      "aria-disabled",
      "true"
    )
  })

  it("生の詳細を描画せず限定されたBetter Auth招待理由を表示する", async () => {
    const actor = userEvent.setup()
    const onInvite = vi
      .fn<
        (input: { email: string; role: "admin" | "member" }) => Promise<unknown>
      >()
      .mockRejectedValue({
        status: 400,
        error: {
          code: "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION",
          message: "database invitation token=provider-secret",
        },
      })

    render(
      <InviteMemberDialog canInviteAdmins pending={false} onInvite={onInvite} />
    )

    await actor.click(screen.getByRole("button", { name: "Invite member" }))
    await actor.type(
      screen.getByRole("textbox", { name: "Email address" }),
      "member@example.test"
    )
    await actor.click(screen.getByRole("button", { name: "Send invitation" }))

    expect(
      await screen.findByText(
        "An invitation is already pending for this email address."
      )
    ).toHaveAttribute("role", "alert")
    expect(screen.queryByText(/provider-secret/u)).not.toBeInTheDocument()
  })
})
