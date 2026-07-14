import type { Meta, StoryObj } from "@storybook/react-vite"
import { Trash2Icon } from "lucide-react"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

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
import { Button } from "./button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./drawer"

const DestructiveConfirmation = ({ onConfirm }: { onConfirm: () => void }) => (
  <AlertDialog>
    <AlertDialogTrigger render={<Button variant="destructive" />}>
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
  </AlertDialog>
)

const MobileNavigationDrawer = () => (
  <Drawer showSwipeHandle>
    <DrawerTrigger render={<Button variant="outline" />}>
      Open mobile navigation
    </DrawerTrigger>
    <DrawerContent>
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
        <DrawerClose render={<Button variant="outline" />}>Done</DrawerClose>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
)

const meta = {
  title: "Components/Overlays",
  component: DestructiveConfirmation,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof DestructiveConfirmation>

export default meta
type Story = StoryObj<typeof meta>

export const DestructiveAlert: Story = {
  args: { onConfirm: fn() },
  play: async ({ args, canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Delete organization" })
    )
    const body = within(document.body)
    await expect(
      body.getByRole("alertdialog", { name: "Delete Acme?" })
    ).toHaveAccessibleDescription(
      "This permanently deletes organization data and cannot be undone."
    )
    await userEvent.click(
      body.getByRole("button", { name: "Permanently delete" })
    )
    await expect(args.onConfirm).toHaveBeenCalledOnce()
  },
}

export const MobileDrawer: StoryObj<typeof MobileNavigationDrawer> = {
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
    await waitFor(() => expect(trigger).toHaveFocus())
  },
}
