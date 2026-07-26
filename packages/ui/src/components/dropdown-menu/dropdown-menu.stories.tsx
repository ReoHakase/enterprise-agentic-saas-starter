import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import { Button } from "../button/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu"

const triggerButton = <Button variant="outline" />

const WorkspaceActionsMenu = () => (
  <DropdownMenu>
    <DropdownMenuTrigger render={triggerButton}>
      Workspace actions
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Acme Cloud</DropdownMenuLabel>
        <DropdownMenuItem onClick={fn()}>Open settings</DropdownMenuItem>
        <DropdownMenuItem disabled>Transfer ownership</DropdownMenuItem>
        <DropdownMenuCheckboxItem checked>
          Show archived issues
        </DropdownMenuCheckboxItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuRadioGroup value="issues">
        <DropdownMenuRadioItem value="overview">Overview</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="issues">Issues</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive">
        Delete organization
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)

const meta = preview.meta({
  title: "Components/Dropdown Menu",
  component: WorkspaceActionsMenu,
  tags: ["autodocs"],
})

export const WorkspaceActions = meta.story({
  play: async ({ canvas, canvasElement, step }) => {
    await step("Navigate the menu with the keyboard", async () => {
      const trigger = canvas.getByRole("button", { name: "Workspace actions" })
      trigger.focus()
      await userEvent.keyboard("{Enter}")
      const body = within(canvasElement.ownerDocument.body)
      await expect(
        body.getByRole("menuitem", { name: "Open settings" })
      ).toHaveFocus()
      await userEvent.keyboard("{ArrowDown}{ArrowDown}")
      await expect(
        body.getByRole("menuitemcheckbox", { name: "Show archived issues" })
      ).toHaveFocus()
      await userEvent.keyboard("{Escape}")
      await waitFor(() => expect(trigger).toHaveFocus())
    })
  },
})
