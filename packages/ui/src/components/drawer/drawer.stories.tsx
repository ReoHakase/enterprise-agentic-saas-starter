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
  </Drawer>
)

const expectDrawerOverlayContract = async (content: HTMLElement) => {
  const document = content.ownerDocument
  const overlays = document.querySelectorAll<HTMLElement>(
    '[data-slot="drawer-overlay"]'
  )
  await expect(overlays).toHaveLength(1)

  const overlay = overlays.item(0)
  if (!overlay) throw new Error("Expected the drawer overlay to be rendered.")

  const view = document.defaultView
  if (!view) throw new Error("Expected the Storybook iframe window.")

  const viewport = content.closest<HTMLElement>('[data-slot="drawer-viewport"]')
  if (!viewport) throw new Error("Expected the drawer viewport to be rendered.")

  const portal = overlay.closest<HTMLElement>('[data-slot="drawer-portal"]')
  if (!portal) throw new Error("Expected the drawer portal to be rendered.")

  await expect(viewport.closest('[data-slot="drawer-portal"]')).toBe(portal)
  await expect(
    overlay.compareDocumentPosition(viewport) &
      view.Node.DOCUMENT_POSITION_FOLLOWING
  ).toBe(view.Node.DOCUMENT_POSITION_FOLLOWING)

  await waitFor(() => {
    const styles = view.getComputedStyle(content)
    expect(styles.filter).toBe("none")
    expect(styles.backdropFilter).toBe("none")
  })
}

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

    await step("モバイル宛先リストを開く", async () => {
      await userEvent.click(trigger)
      const content = body.getByRole("dialog", {
        name: "Workspace navigation",
      })
      await expectDrawerOverlayContract(content)
      await expect(content).toBeVisible()
      await expect(
        body.getByRole("navigation", { name: "Workspace navigation" })
      ).toBeVisible()
    })

    await step("閉じてフォーカスを戻す", async () => {
      await userEvent.click(body.getByRole("button", { name: "Done" }))
      await waitFor(() => expect(trigger).toHaveFocus())
    })
  },
})
