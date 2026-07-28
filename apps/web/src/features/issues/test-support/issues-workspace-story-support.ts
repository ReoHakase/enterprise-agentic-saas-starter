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

export const getComputedColorAlpha = (color: string) => {
  if (color === "transparent") return 0
  const legacyAlpha = color.match(/^rgba\(.+,\s*([\d.]+)\)$/u)?.[1]
  if (legacyAlpha) return Number(legacyAlpha)
  const modernAlpha = color.match(/\/\s*([\d.]+)\s*\)$/u)?.[1]
  return modernAlpha ? Number(modernAlpha) : 1
}

const rectanglesOverlap = (first: DOMRect, second: DOMRect) =>
  first.left < second.right &&
  first.right > second.left &&
  first.top < second.bottom &&
  first.bottom > second.top

const getToolbarGroupActions = (group: HTMLElement, name: string) => {
  const reset = within(group).getByRole("button", { name })
  const actions = reset.closest<HTMLElement>(
    '[data-slot="data-table-toolbar-group-actions"]'
  )
  if (!actions) {
    throw new globalThis.Error("Expected toolbar group actions")
  }
  return actions
}

export const verifyWideToolbarGroups = ({
  filterGroup,
  sortGroup,
}: {
  filterGroup: HTMLElement
  sortGroup: HTMLElement
}) => {
  const controlsRow = filterGroup.closest<HTMLElement>(
    '[data-toolbar-row="controls"]'
  )
  if (!controlsRow) {
    throw new globalThis.Error("Expected controls toolbar row")
  }
  const filterRect = filterGroup.getBoundingClientRect()
  const sortRect = sortGroup.getBoundingClientRect()
  const columnGap = parseFloat(getComputedStyle(controlsRow).columnGap)
  expect(filterRect.width + sortRect.width + columnGap).toBeLessThanOrEqual(
    controlsRow.clientWidth
  )
  expect(filterRect.top).toBeCloseTo(sortRect.top, 0)
  expect(filterRect.right).toBeLessThanOrEqual(sortRect.left)

  for (const group of [filterGroup, sortGroup]) {
    expect(group).not.toHaveClass("grow")
    expect(group).not.toHaveClass("flex-1")
    expect(group).not.toHaveClass("basis-full")
  }
  const resetActions = getToolbarGroupActions(filterGroup, "Reset filters")
  const previousControl = resetActions.previousElementSibling
  if (!(previousControl instanceof HTMLElement)) {
    throw new globalThis.Error("Expected control before filter reset")
  }
  const resetRect = resetActions.getBoundingClientRect()
  const previousRect = previousControl.getBoundingClientRect()
  expect((resetRect.top + resetRect.bottom) / 2).toBeCloseTo(
    (previousRect.top + previousRect.bottom) / 2,
    0
  )
}

export const verifyWrappedToolbarGroups = ({
  filterGroup,
  sortGroup,
}: {
  filterGroup: HTMLElement
  sortGroup: HTMLElement
}) => {
  const filterRect = filterGroup.getBoundingClientRect()
  const sortRect = sortGroup.getBoundingClientRect()
  const controlsRow = filterGroup.closest<HTMLElement>(
    '[data-toolbar-row="controls"]'
  )
  if (!controlsRow) {
    throw new globalThis.Error("Expected controls toolbar row")
  }
  const rowGap = parseFloat(getComputedStyle(controlsRow).rowGap)
  expect(sortRect.top).toBeCloseTo(filterRect.bottom + rowGap, 0)

  const filterStyle = getComputedStyle(filterGroup)
  const childBottom = Math.max(
    ...Array.from(
      filterGroup.children,
      (child) => child.getBoundingClientRect().bottom
    )
  )
  expect(filterRect.bottom).toBeCloseTo(
    childBottom +
      parseFloat(filterStyle.paddingBottom) +
      parseFloat(filterStyle.borderBottomWidth),
    0
  )

  const resetActions = getToolbarGroupActions(filterGroup, "Reset filters")
  expect(resetActions).not.toHaveClass("basis-full")
  expect(resetActions).not.toHaveClass("w-full")
  const previousControl = resetActions.previousElementSibling
  if (!(previousControl instanceof HTMLElement)) {
    throw new globalThis.Error("Expected control before filter reset")
  }
  const resetRect = resetActions.getBoundingClientRect()
  const previousRect = previousControl.getBoundingClientRect()
  expect((resetRect.top + resetRect.bottom) / 2).toBeCloseTo(
    (previousRect.top + previousRect.bottom) / 2,
    0
  )
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
  await expect(input).toHaveValue("Taylor")

  const target = within(content).getByRole("option", {
    name: "Taylor Morgan",
  })
  await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}")
  await waitFor(() => expect(target).toHaveAttribute("aria-selected", "true"))
  await userEvent.keyboard("{Escape}")
  await waitFor(() => expect(trigger).toHaveFocus())
}

export const verifyStickyControlIslands = async ({
  canvasElement,
  issueNumber,
  issueTitle,
}: {
  canvasElement: HTMLElement
  issueNumber: number
  issueTitle: string
}) => {
  const canvas = within(canvasElement)
  const scrollRegion = canvas.getByRole("region", {
    name: "Organization issues",
  })
  const selectionIslands = canvasElement.querySelectorAll<HTMLElement>(
    '[data-slot="data-table-selection-island"]'
  )
  const selectionIsland = selectionIslands.item(1)
  const actionsButton = canvas.getByRole("button", {
    name: `Actions for ${issueTitle}`,
  })
  const actionsIsland = actionsButton.closest<HTMLElement>(
    '[data-slot="issue-actions-island"]'
  )
  const issueRow = actionsButton.closest("tr")
  if (!(selectionIsland && actionsIsland && issueRow)) {
    throw new globalThis.Error("Sticky issue controls were not rendered")
  }

  scrollRegion.scrollLeft = Math.max(
    scrollRegion.scrollWidth - scrollRegion.clientWidth - 20,
    1
  )
  await waitFor(() => expect(scrollRegion.scrollLeft).toBeGreaterThan(0))

  for (const island of [selectionIsland, actionsIsland]) {
    const style = getComputedStyle(island)
    expect(getComputedColorAlpha(style.backgroundColor)).toBeGreaterThanOrEqual(
      0.85
    )
    expect(getComputedColorAlpha(style.backgroundColor)).toBeLessThan(1)
    expect(style.backdropFilter).toContain("blur")
    expect(style.borderTopWidth).toBe("0px")
  }
  expect(
    canvas
      .getByRole("checkbox", {
        name: `Select issue ${issueNumber}`,
      })
      .getBoundingClientRect()
  ).toMatchObject({ height: 16, width: 16 })
  expect(actionsButton.getBoundingClientRect()).toMatchObject({
    height: 32,
    width: 32,
  })
  const selectionInner = selectionIsland.firstElementChild
  if (!(selectionInner instanceof HTMLElement)) {
    throw new globalThis.Error(
      "Selection island inner control was not rendered"
    )
  }
  for (const [outer, inner] of [
    [selectionIsland, selectionInner],
    [actionsIsland, actionsButton],
  ] as const) {
    const outerStyle = getComputedStyle(outer)
    const innerStyle = getComputedStyle(inner)
    expect(parseFloat(outerStyle.borderTopLeftRadius)).toBeCloseTo(
      parseFloat(innerStyle.borderTopLeftRadius) +
        parseFloat(outerStyle.paddingTop)
    )
  }
  const normalSelectionSurface =
    getComputedStyle(selectionIsland).backgroundColor

  const scrollingCells = [
    ...issueRow.querySelectorAll<HTMLElement>('[data-slot="table-cell"]'),
  ].filter(
    (cell) => !cell.contains(selectionIsland) && !cell.contains(actionsButton)
  )
  for (const island of [selectionIsland, actionsIsland]) {
    expect(
      scrollingCells.some((cell) =>
        rectanglesOverlap(
          island.getBoundingClientRect(),
          cell.getBoundingClientRect()
        )
      )
    ).toBe(true)
  }

  await userEvent.click(
    canvas.getByRole("checkbox", {
      name: `Select issue ${issueNumber}`,
    })
  )
  await waitFor(() =>
    expect(getComputedStyle(selectionIsland).backgroundColor).not.toBe(
      normalSelectionSurface
    )
  )
  for (const island of [selectionIsland, actionsIsland]) {
    const style = getComputedStyle(island)
    expect(getComputedColorAlpha(style.backgroundColor)).toBeGreaterThanOrEqual(
      0.85
    )
    expect(getComputedColorAlpha(style.backgroundColor)).toBeLessThan(1)
    expect(style.borderTopWidth).toBe("0px")
    expect(style.backdropFilter).toContain("blur")
  }
}
