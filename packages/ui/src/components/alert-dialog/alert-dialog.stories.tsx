import { Trash2Icon } from "lucide-react"
import { useCallback, useState } from "react"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import { Button } from "../button/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog"

const destructiveButton = <Button variant="destructive" />

const DeleteOrganizationDialog = ({
  onDelete,
  onOpenChange,
}: {
  onDelete: () => void
  onOpenChange: (open: boolean) => void
}) => {
  const [open, setOpen] = useState(false)
  const changeOpen = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen)
      onOpenChange(nextOpen)
    },
    [onOpenChange]
  )
  const confirmDelete = useCallback(() => {
    onDelete()
    changeOpen(false)
  }, [changeOpen, onDelete])

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogTrigger render={destructiveButton}>
        Delete organization
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <Trash2Icon aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete Acme Cloud?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes organization data and cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirmDelete}>
            Permanently delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
      <AlertDialogPortal>
        <AlertDialogOverlay className="pointer-events-none bg-transparent backdrop-blur-none" />
      </AlertDialogPortal>
    </AlertDialog>
  )
}

const meta = preview.meta({
  title: "Components/Alert Dialog",
  component: DeleteOrganizationDialog,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { onDelete: fn(), onOpenChange: fn() },
})

export const DeleteOrganization = meta.story({
  play: async ({ args, canvas, canvasElement, step }) => {
    const trigger = canvas.getByRole("button", {
      name: "Delete organization",
    })
    const body = within(canvasElement.ownerDocument.body)

    await step("Cancel and restore focus", async () => {
      await userEvent.click(trigger)
      await expect(
        body.getByRole("alertdialog", { name: "Delete Acme Cloud?" })
      ).toHaveAccessibleDescription(
        "This permanently deletes organization data and cannot be undone."
      )
      await userEvent.click(body.getByRole("button", { name: "Cancel" }))
      await waitFor(() => expect(trigger).toHaveFocus())
    })

    await step("Confirm the destructive action", async () => {
      await userEvent.click(trigger)
      await userEvent.click(
        body.getByRole("button", { name: "Permanently delete" })
      )
      await expect(args.onDelete).toHaveBeenCalledOnce()
      await waitFor(() =>
        expect(
          body.queryByRole("alertdialog", { name: "Delete Acme Cloud?" })
        ).not.toBeInTheDocument()
      )
    })
  },
})
