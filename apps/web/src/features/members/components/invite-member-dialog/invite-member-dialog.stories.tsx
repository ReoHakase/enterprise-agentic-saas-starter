import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import { InviteMemberDialog } from "./invite-member-dialog"

const invited = fn(async () => undefined)

const meta = preview.meta({
  title: "Web/Members/Invite Member Dialog",
  component: InviteMemberDialog,
  tags: ["autodocs"],
  args: {
    canInviteAdmins: true,
    pending: false,
    onInvite: invited,
  },
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  beforeEach() {
    invited.mockClear()
  },
  play: async ({ canvas, canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)

    await step("Invite one normalized fictional recipient", async () => {
      const trigger = canvas.getByRole("button", { name: "Invite member" })
      await userEvent.click(trigger)
      const roleTrigger = body.getByRole("combobox", {
        name: "Invitation role",
      })
      await waitFor(() =>
        expect(
          within(roleTrigger).getByTestId("organization-role-member")
        ).toBeVisible()
      )
      await userEvent.click(roleTrigger)
      await Promise.all(
        (
          [
            ["Member", "organization-role-member"],
            ["Admin", "organization-role-admin"],
          ] as const
        ).map(async ([roleName, testId]) => {
          const roleOption = await body.findByRole("option", { name: roleName })
          await expect(within(roleOption).getByTestId(testId)).toBeVisible()
        })
      )
      await userEvent.keyboard("{Escape}")
      await userEvent.type(
        body.getByRole("textbox", { name: "Email address" }),
        "One@Example.test"
      )
      await userEvent.click(
        body.getByRole("button", { name: "Send invitation" })
      )
      await waitFor(() =>
        expect(invited).toHaveBeenCalledWith({
          email: "one@example.test",
          role: "member",
        })
      )
      await waitFor(() => expect(trigger).toHaveFocus())
    })
  },
})

export const PermissionLimited = meta.story({
  args: { canInviteAdmins: false },
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole("button", { name: "Invite member" }))
    const role = await body.findByRole("combobox", {
      name: "Invitation role",
    })
    await userEvent.click(role)
    const adminOption = await body.findByRole("option", { name: "Admin" })
    await expect(adminOption).toHaveAttribute("aria-disabled", "true")
    await userEvent.keyboard("{Escape}")
    await waitFor(() =>
      expect(body.queryByRole("listbox")).not.toBeInTheDocument()
    )
    await userEvent.click(body.getByRole("button", { name: "Cancel" }))
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "Invite member" })
      ).not.toBeInTheDocument()
    )
  },
})

export const Pending = meta.story({
  args: { pending: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Invite member" })
    ).toBeDisabled()
  },
})
