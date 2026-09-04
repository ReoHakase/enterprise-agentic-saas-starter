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

    await step(
      "招待に成功するとdialogを閉じてトリガーへフォーカスを戻す",
      async () => {
        const trigger = canvas.getByRole("button", { name: "Invite member" })
        await userEvent.click(trigger)
        await userEvent.type(
          body.getByRole("textbox", { name: "Email address" }),
          "One@Example.test"
        )
        await userEvent.click(
          body.getByRole("button", { name: "Send invitation" })
        )
        await waitFor(() =>
          expect(
            body.queryByRole("dialog", { name: "Invite member" })
          ).not.toBeInTheDocument()
        )
        await waitFor(() => expect(trigger).toHaveFocus())
      }
    )
  },
})

export const PermissionLimited = meta.story({
  args: { canInviteAdmins: false },
})

export const Pending = meta.story({
  args: { pending: true },
})
