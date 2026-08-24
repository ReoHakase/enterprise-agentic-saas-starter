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
    </AlertDialog>
  )
}

const expectAlertDialogOverlayContract = async (content: HTMLElement) => {
  const document = content.ownerDocument
  const overlays = document.querySelectorAll<HTMLElement>(
    '[data-slot="alert-dialog-overlay"]'
  )
  await expect(overlays).toHaveLength(1)

  const overlay = overlays.item(0)
  if (!overlay) {
    throw new Error("Expected the alert dialog overlay to be rendered.")
  }

  const view = document.defaultView
  if (!view) throw new Error("Expected the Storybook iframe window.")

  const portal = overlay.closest<HTMLElement>(
    '[data-slot="alert-dialog-portal"]'
  )
  if (!portal) {
    throw new Error("Expected the alert dialog portal to be rendered.")
  }

  await expect(content.closest('[data-slot="alert-dialog-portal"]')).toBe(
    portal
  )
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

const meta = preview.meta({
  title: "Components/Alert Dialog",
  component: DeleteOrganizationDialog,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { onDelete: fn(), onOpenChange: fn() },
})

export const DeleteOrganization = meta.story({
  play: async ({ canvas, canvasElement, step }) => {
    const trigger = canvas.getByRole("button", {
      name: "Delete organization",
    })
    const body = within(canvasElement.ownerDocument.body)

    await step("破壊的確認をoverlayへ表示する", async () => {
      await userEvent.click(trigger)
      const content = body.getByRole("alertdialog", {
        name: "Delete Acme Cloud?",
      })
      await expectAlertDialogOverlayContract(content)
    })
  },
})

export const DeleteOrganizationCancelled = meta.story({
  play: async ({ canvas, canvasElement, step }) => {
    const trigger = canvas.getByRole("button", {
      name: "Delete organization",
    })
    const body = within(canvasElement.ownerDocument.body)

    await step("キャンセルしてフォーカスを復元する", async () => {
      await userEvent.click(trigger)
      await userEvent.click(body.getByRole("button", { name: "Cancel" }))
      await waitFor(() => expect(trigger).toHaveFocus())
    })
  },
})

export const DeleteOrganizationConfirmed = meta.story({
  play: async ({ args, canvas, canvasElement, step }) => {
    const trigger = canvas.getByRole("button", {
      name: "Delete organization",
    })
    const body = within(canvasElement.ownerDocument.body)
    await step("破壊的操作を確認する", async () => {
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
