import { Trash2Icon } from "lucide-react"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

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
} from "../alert-dialog/alert-dialog"
import { Button } from "../button/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerSwipeHandle,
  DrawerTitle,
  DrawerTrigger,
} from "../drawer/drawer"

const destructiveButtonRender = <Button variant="destructive" />
const outlineButtonRender = <Button variant="outline" />

const DestructiveConfirmation = ({ onConfirm }: { onConfirm: () => void }) => (
  <AlertDialog>
    <AlertDialogTrigger render={destructiveButtonRender}>
      Delete organization
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogMedia className="bg-destructive/10 text-destructive">
          <Trash2Icon aria-hidden="true" />
        </AlertDialogMedia>
        <AlertDialogTitle>Delete Acme?</AlertDialogTitle>
        <AlertDialogDescription>
          This permanently deletes organization data and cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onClick={onConfirm}>
          Permanently delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
    <AlertDialogPortal>
      <AlertDialogOverlay className="pointer-events-none bg-transparent backdrop-blur-none" />
    </AlertDialogPortal>
  </AlertDialog>
)

const MobileNavigationDrawer = () => (
  <Drawer>
    <DrawerTrigger render={outlineButtonRender}>
      Open mobile navigation
    </DrawerTrigger>
    <DrawerContent>
      <DrawerSwipeHandle />
      <DrawerHeader>
        <DrawerTitle>Workspace navigation</DrawerTitle>
        <DrawerDescription>
          Choose a tenant-scoped destination. Closing returns focus to the
          trigger.
        </DrawerDescription>
      </DrawerHeader>
      <nav className="grid gap-2 p-4" aria-label="Workspace navigation">
        <Button variant="secondary">Overview</Button>
        <Button variant="ghost">Issues</Button>
        <Button variant="ghost">Members</Button>
      </nav>
      <DrawerFooter>
        <DrawerClose render={outlineButtonRender}>Done</DrawerClose>
      </DrawerFooter>
    </DrawerContent>
    <DrawerPortal>
      <DrawerOverlay className="pointer-events-none bg-transparent backdrop-blur-none" />
    </DrawerPortal>
  </Drawer>
)

const meta = preview.meta({
  title: "Components/Overlays",
  component: DestructiveConfirmation,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
})

export const DestructiveAlert = meta.story({
  args: { onConfirm: fn() },
  play: async ({ args, canvas }) => {
    const trigger = canvas.getByRole("button", { name: "Delete organization" })
    await userEvent.click(trigger)
    const body = within(document.body)
    await expect(
      body.getByRole("alertdialog", { name: "Delete Acme?" })
    ).toHaveAccessibleDescription(
      "This permanently deletes organization data and cannot be undone."
    )
    await userEvent.click(body.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(trigger).toHaveFocus())

    await userEvent.click(trigger)
    await userEvent.click(
      body.getByRole("button", { name: "Permanently delete" })
    )
    await expect(args.onConfirm).toHaveBeenCalledOnce()
  },
})

export const MobileDrawer = meta.story({
  render: () => <MobileNavigationDrawer />,
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", {
      name: "Open mobile navigation",
    })
    await userEvent.click(trigger)
    const body = within(document.body)
    await expect(
      body.getByRole("dialog", { name: "Workspace navigation" })
    ).toBeVisible()
    await expect(
      body.getByRole("navigation", { name: "Workspace navigation" })
    ).toBeVisible()
    await userEvent.click(body.getByRole("button", { name: "Done" }))
    await waitFor(() => expect(trigger).toHaveFocus(), { timeout: 5_000 })
  },
})
