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
  DialogOverlay,
  DialogPortal,
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
      <DialogPortal>
        <DialogOverlay className="pointer-events-none bg-transparent backdrop-blur-none" />
      </DialogPortal>
    </Dialog>
  )
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
    await userEvent.click(body.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(trigger).toHaveFocus())
  },
})
