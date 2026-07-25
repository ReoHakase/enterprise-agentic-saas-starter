import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

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
} from "./drawer"

const outlineButton = <Button variant="outline" />

const MobileNavigationDrawer = () => (
  <Drawer>
    <DrawerTrigger render={outlineButton}>Open mobile navigation</DrawerTrigger>
    <DrawerContent>
      <DrawerSwipeHandle />
      <DrawerHeader>
        <DrawerTitle>Workspace navigation</DrawerTitle>
        <DrawerDescription>Choose an Acme Cloud destination.</DrawerDescription>
      </DrawerHeader>
      <nav className="grid gap-2 p-4" aria-label="Workspace navigation">
        <Button variant="secondary">Overview</Button>
        <Button variant="ghost">Issues</Button>
        <Button variant="ghost">Members</Button>
      </nav>
      <DrawerFooter>
        <DrawerClose render={outlineButton}>Done</DrawerClose>
      </DrawerFooter>
    </DrawerContent>
    <DrawerPortal>
      <DrawerOverlay className="pointer-events-none bg-transparent backdrop-blur-none" />
    </DrawerPortal>
  </Drawer>
)

const meta = preview.meta({
  title: "Components/Drawer",
  component: MobileNavigationDrawer,
  tags: ["autodocs"],
})

export const MobileNavigation = meta.story({
  play: async ({ canvas, canvasElement, step }) => {
    const trigger = canvas.getByRole("button", {
      name: "Open mobile navigation",
    })
    const body = within(canvasElement.ownerDocument.body)

    await step("Open the mobile destination list", async () => {
      await userEvent.click(trigger)
      await expect(
        body.getByRole("dialog", { name: "Workspace navigation" })
      ).toBeVisible()
      await expect(
        body.getByRole("navigation", { name: "Workspace navigation" })
      ).toBeVisible()
    })

    await step("Close and return focus", async () => {
      await userEvent.click(body.getByRole("button", { name: "Done" }))
      await waitFor(() => expect(trigger).toHaveFocus())
    })
  },
})
