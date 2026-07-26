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
  play: async ({ canvas, step }) => {
    const body = within(document.body)

    await step("Invite normalized fictional recipients", async () => {
      const trigger = canvas.getByRole("button", { name: "Invite members" })
      await userEvent.click(trigger)
      await userEvent.type(
        body.getByRole("textbox", { name: "Email addresses" }),
        "One@Example.test, two@example.test"
      )
      await userEvent.click(
        body.getByRole("button", { name: "Send invitations" })
      )
      await waitFor(() =>
        expect(invited).toHaveBeenCalledWith({
          emails: ["one@example.test", "two@example.test"],
          role: "member",
        })
      )
      await waitFor(() => expect(trigger).toHaveFocus())
    })
  },
})

export const PermissionLimited = meta.story({
  args: { canInviteAdmins: false },
  play: async ({ canvas }) => {
    const body = within(document.body)
    await userEvent.click(
      canvas.getByRole("button", { name: "Invite members" })
    )
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
        body.queryByRole("dialog", { name: "Invite members" })
      ).not.toBeInTheDocument()
    )
  },
})

export const Pending = meta.story({
  args: { pending: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Invite members" })
    ).toBeDisabled()
  },
})
