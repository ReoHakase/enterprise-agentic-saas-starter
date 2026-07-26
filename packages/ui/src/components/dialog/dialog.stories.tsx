import { type FormEvent, useCallback } from "react"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import { Button } from "../button/button"
import { Field, FieldLabel } from "../field/field"
import { Input } from "../input/input"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog"

const triggerButton = <Button />
const closeButton = <Button type="button" variant="outline" />

const InviteDialog = ({ onInvite }: { onInvite: (email: string) => void }) => {
  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      onInvite(String(new FormData(event.currentTarget).get("email")))
    },
    [onInvite]
  )

  return (
    <Dialog>
      <DialogTrigger render={triggerButton}>Invite member</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Invite member</DialogTitle>
            <DialogDescription>
              Send Acme Cloud access to a verified email address.
            </DialogDescription>
          </DialogHeader>
          <Field className="py-5">
            <FieldLabel htmlFor="dialog-invite-email">Email</FieldLabel>
            <Input
              id="dialog-invite-email"
              name="email"
              type="email"
              placeholder="teammate@example.test"
              required
            />
          </Field>
          <DialogFooter>
            <DialogClose render={closeButton}>Cancel</DialogClose>
            <Button type="submit">Send invitation</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const expectDialogOverlayContract = async (content: HTMLElement) => {
  const document = content.ownerDocument
  const overlays = document.querySelectorAll<HTMLElement>(
    '[data-slot="dialog-overlay"]'
  )
  await expect(overlays).toHaveLength(1)

  const overlay = overlays.item(0)
  if (!overlay) throw new Error("Expected the dialog overlay to be rendered.")

  const view = document.defaultView
  if (!view) throw new Error("Expected the Storybook iframe window.")

  const portal = overlay.closest<HTMLElement>('[data-slot="dialog-portal"]')
  if (!portal) throw new Error("Expected the dialog portal to be rendered.")

  await expect(content.closest('[data-slot="dialog-portal"]')).toBe(portal)
  await expect(
    overlay.compareDocumentPosition(content) &
      view.Node.DOCUMENT_POSITION_FOLLOWING
  ).toBe(view.Node.DOCUMENT_POSITION_FOLLOWING)

  await waitFor(() => {
    const styles = view.getComputedStyle(content)
    expect(styles.filter).toBe("none")
    expect(styles.backdropFilter).toBe("none")
  })
}

const meta = preview
  .type<{ args: { onInvite: (email: string) => void } }>()
  .meta({
    title: "Components/Dialog",
    component: InviteDialog,
    tags: ["autodocs"],
    args: { onInvite: fn() },
  })

export const InviteMember = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ args, canvas, canvasElement, step }) => {
    const trigger = canvas.getByRole("button", { name: "Invite member" })
    const body = within(canvasElement.ownerDocument.body)

    await step("Validate the required email field", async () => {
      await userEvent.click(trigger)
      await expectDialogOverlayContract(
        body.getByRole("dialog", { name: "Invite member" })
      )
      await userEvent.click(
        body.getByRole("button", { name: "Send invitation" })
      )
      await expect(body.getByRole("textbox", { name: "Email" })).toBeInvalid()
    })

    await step("Submit a valid fictional member", async () => {
      await userEvent.type(
        body.getByRole("textbox", { name: "Email" }),
        "new-member@example.test"
      )
      await userEvent.click(
        body.getByRole("button", { name: "Send invitation" })
      )
      await expect(args.onInvite).toHaveBeenCalledWith(
        "new-member@example.test"
      )
    })
  },
})

export const Cancelled = meta.story({
  play: async ({ canvas, canvasElement }) => {
    const trigger = canvas.getByRole("button", { name: "Invite member" })
    await userEvent.click(trigger)
    const body = within(canvasElement.ownerDocument.body)
    await expectDialogOverlayContract(
      body.getByRole("dialog", { name: "Invite member" })
    )
    await userEvent.click(body.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(trigger).toHaveFocus())
  },
})
