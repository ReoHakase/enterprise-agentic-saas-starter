import { expect, userEvent, waitFor, within } from "storybook/test"
import { MINIMAL_VIEWPORTS } from "storybook/viewport"

export const issueWorkspaceViewportOptions = {
  ...MINIMAL_VIEWPORTS,
  toolbarWide: {
    name: "Toolbar wide",
    styles: { width: "2048px", height: "900px" },
    type: "desktop",
  },
  toolbarWrapped: {
    name: "Toolbar wrapped",
    styles: { width: "1024px", height: "900px" },
    type: "desktop",
  },
} as const

export const additionalIssueAssignee = {
  id: "user-taylor",
  name: "Taylor Morgan",
  email: "taylor@example.test",
  profileImage: null,
}

export const verifySearchableAssigneeKeyboard = async ({
  canvasElement,
}: {
  canvasElement: HTMLElement
}) => {
  const canvas = within(canvasElement)
  const ownerBody = within(canvasElement.ownerDocument.body)
  const trigger = canvas.getByRole("button", { name: "Assignee" })
  await userEvent.click(trigger)
  const content = await ownerBody.findByRole("dialog", {
    name: "Assignee filter",
  })
  const input = within(content).getByRole("combobox", {
    name: "Search assignee",
  })
  await userEvent.click(input)
  await userEvent.type(input, "Taylor")

  const target = within(content).getByRole("option", {
    name: "Taylor Morgan",
  })
  await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}")
  await expect(input).toHaveAttribute("aria-activedescendant", target.id)
  await userEvent.keyboard("{Escape}{Escape}")
  await waitFor(() => expect(content).not.toBeInTheDocument())
  await expect(trigger).toHaveFocus()
}
