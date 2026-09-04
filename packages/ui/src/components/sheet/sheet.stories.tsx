import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import { Button } from "../button/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet"

const triggerButton = <Button variant="outline" />
const closeButton = <Button variant="outline" />

const OrganizationSettingsSheet = () => (
  <Sheet>
    <SheetTrigger render={triggerButton}>Open settings</SheetTrigger>
    <SheetContent showCloseButton={false}>
      <SheetHeader>
        <SheetTitle>Organization settings</SheetTitle>
        <SheetDescription>
          Review Acme Cloud identity and access configuration.
        </SheetDescription>
      </SheetHeader>
      <dl className="grid gap-3 px-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Verified domain</dt>
          <dd>acme.example.test</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Members</dt>
          <dd>24 active</dd>
        </div>
      </dl>
      <SheetFooter>
        <SheetClose render={closeButton}>Close</SheetClose>
      </SheetFooter>
    </SheetContent>
  </Sheet>
)

const meta = preview.meta({
  title: "Components/Sheet",
  component: OrganizationSettingsSheet,
  tags: ["autodocs"],
})

export const OrganizationSettings = meta.story({
  play: async ({ canvas, canvasElement, step }) => {
    const trigger = canvas.getByRole("button", { name: "Open settings" })
    const body = within(canvasElement.ownerDocument.body)
    await step("設定を開いてボタンで閉じる", async () => {
      await userEvent.click(trigger)
      await waitFor(() =>
        expect(
          body.getByRole("dialog", { name: "Organization settings" })
        ).toBeVisible()
      )
      await userEvent.click(body.getByRole("button", { name: "Close" }))
      await waitFor(() => expect(trigger).toHaveFocus())
    })
  },
})

export const LeftSide = meta.story({
  render: () => (
    <Sheet>
      <SheetTrigger render={triggerButton}>Open navigation</SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Acme Cloud navigation</SheetTitle>
          <SheetDescription>Mobile workspace destinations.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
})
