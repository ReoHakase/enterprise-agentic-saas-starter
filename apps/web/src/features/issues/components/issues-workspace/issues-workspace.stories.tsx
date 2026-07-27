import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"
import { getDataTableStorageKey } from "@/components/data-table/data-table-state"
import { AgentFormRegistryProvider } from "@/features/agent"

import {
  fictionalIssueAssignees,
  fictionalIssueSearchState,
  fictionalIssueView,
} from "../../test-support/fixtures"
import {
  additionalIssueAssignee,
  getComputedColorAlpha,
  issueWorkspaceViewportOptions,
  verifySearchableAssigneeKeyboard,
  verifyStickyControlIslands,
  verifyWideToolbarGroups,
  verifyWrappedToolbarGroups,
} from "../../test-support/issues-workspace-story-support"
import { IssuesWorkspace } from "./issues-workspace"

const createIssue = fn(async () => undefined)
const toggleIssue = fn(async () => undefined)
const deleteIssue = fn(async () => undefined)
const updateIssue = fn(async () => undefined)
const selectIssue = fn()
const retry = fn()
const search = fn()
const changeView = fn(async () => new URLSearchParams())
const tallIssueViews = Array.from({ length: 20 }, (_, index) => ({
  ...fictionalIssueView,
  id: `${fictionalIssueView.id}-${index}`,
  number: fictionalIssueView.number + index,
  title:
    index === 0
      ? fictionalIssueView.title
      : `${fictionalIssueView.title} ${index}`,
}))

const meta = preview.meta({
  title: "Web/Issues/Issues Workspace",
  component: IssuesWorkspace,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <AgentFormRegistryProvider>
        <div className="mx-auto w-full">
          <Story />
        </div>
      </AgentFormRegistryProvider>
    ),
  ],
  args: {
    issues: [fictionalIssueView],
    organizationId: fictionalIssueView.organizationId,
    currentUserId: fictionalIssueAssignees[0]?.id ?? "user-1",
    searchState: fictionalIssueSearchState,
    total: 1,
    pageSize: 20 as const,
    assignees: fictionalIssueAssignees,
    labelOptions: ["billing", "incident"],
    onLabelSearchChange: fn(),
    getIssueHref: (issue) => `/organization/acme/issues/${issue.number}`,
    onCreate: createIssue,
    onToggle: toggleIssue,
    onDelete: deleteIssue,
    onUpdate: updateIssue,
    onSelectIssue: selectIssue,
    onRetry: retry,
    onSearchChange: search,
    onViewChange: changeView,
  },
  parameters: {
    viewport: {
      options: issueWorkspaceViewportOptions,
    },
  },
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, canvasElement, step }) => {
    const ownerBody = canvasElement.ownerDocument.body

    await step("Search and open the row action menu", async () => {
      const searchInput = canvas.getByRole("searchbox", {
        name: "Search issues",
      })
      await userEvent.type(searchInput, "billing")
      await waitFor(() => expect(search).toHaveBeenCalledWith("billing"))
      const actions = canvas.getByRole("button", {
        name: `Actions for ${fictionalIssueView.title}`,
      })
      await userEvent.click(actions)
      await waitFor(() =>
        expect(actions).toHaveAttribute("aria-expanded", "true")
      )
      await userEvent.keyboard("{Escape}")
      await waitFor(() =>
        expect(actions).toHaveAttribute("aria-expanded", "false")
      )
      await waitFor(
        () =>
          expect(
            ownerBody.querySelector("[data-base-ui-focus-guard]")
          ).not.toBeInTheDocument(),
        { timeout: 3_000 }
      )
    })
  },
})

export const FacetedFilters = meta.story({
  play: async ({ canvas, canvasElement }) => {
    const ownerBody = within(canvasElement.ownerDocument.body)
    changeView.mockClear()
    const trigger = canvas.getByRole("combobox", { name: "Status" })
    await userEvent.click(trigger)
    const inProgress = await ownerBody.findByRole("option", {
      name: "In progress",
    })
    await userEvent.keyboard("i")
    await waitFor(() => expect(inProgress).toHaveFocus())
    await userEvent.keyboard("{Enter}")
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    const closed = ownerBody.getByRole("option", { name: "Closed" })
    await userEvent.keyboard("{ArrowDown}")
    await waitFor(() => expect(closed).toHaveFocus())
    await userEvent.keyboard("{Enter}")
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(trigger).toHaveFocus())
    await waitFor(() =>
      expect(changeView).toHaveBeenCalledWith(
        expect.objectContaining({
          statuses: ["in_progress", "closed"],
          page: 1,
        })
      )
    )
    await waitFor(() =>
      expect(ownerBody.queryByRole("dialog")).not.toBeInTheDocument()
    )
  },
})

export const InclusivePriorityRange = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, canvasElement }) => {
    const ownerBody = within(canvasElement.ownerDocument.body)
    changeView.mockClear()
    await userEvent.click(canvas.getByRole("button", { name: "Priority" }))
    const sliders = await ownerBody.findAllByRole("slider")
    expect(sliders).toHaveLength(2)
    for (const slider of sliders) {
      expect(slider).toHaveAttribute("aria-orientation", "vertical")
    }
    const visibleOptions = ["Urgent", "High", "Medium", "Low", "No priority"]
      .map((label) => ownerBody.getByRole("button", { name: `Only ${label}` }))
      .map((button) => button.getBoundingClientRect().top)
    expect(visibleOptions).toEqual(visibleOptions.toSorted((a, b) => a - b))

    const urgent = ownerBody.getByRole("button", { name: "Only Urgent" })
    const high = ownerBody.getByRole("button", { name: "Only High" })
    const medium = ownerBody.getByRole("button", { name: "Only Medium" })
    await expect(sliders[0]).toHaveFocus()
    await userEvent.keyboard("{Tab}")
    await expect(sliders[1]).toHaveFocus()
    await userEvent.keyboard("{Tab}")
    await expect(urgent).toHaveFocus()
    for (const option of ownerBody.getAllByRole("button", {
      name: /^Only /,
    })) {
      expect(option.tabIndex).toBe(option === urgent ? 0 : -1)
    }
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}")
    await expect(medium).toHaveAttribute("aria-pressed", "true")
    expect(medium).toHaveClass("data-pressed:bg-muted")
    expect(medium).not.toHaveClass("data-pressed:bg-primary")
    await waitFor(() =>
      expect(getComputedStyle(medium).backgroundColor).toBe(
        getComputedStyle(medium).getPropertyValue("--muted").trim()
      )
    )
    await userEvent.keyboard("{ArrowUp}")
    await expect(high).toHaveFocus()
    await userEvent.keyboard("{ArrowDown}")
    await expect(medium).toHaveFocus()

    const maximumSlider = sliders[1]
    const visibleThumb = maximumSlider?.closest<HTMLElement>(
      '[data-slot="slider-thumb"]'
    )
    if (!(maximumSlider && visibleThumb)) {
      throw new globalThis.Error("Expected a visible maximum slider thumb")
    }
    const shadowBeforeFocus = getComputedStyle(visibleThumb).boxShadow
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}")
    await expect(maximumSlider).toHaveFocus()
    await waitFor(() =>
      expect(getComputedStyle(visibleThumb).boxShadow).not.toBe(
        shadowBeforeFocus
      )
    )
    const maximumBefore = maximumSlider.getAttribute("aria-valuenow")
    await userEvent.keyboard("{ArrowUp}")
    expect(maximumSlider).not.toHaveAttribute("aria-valuenow", maximumBefore)
    await userEvent.keyboard("{Escape}")
    await waitFor(() =>
      expect(changeView).toHaveBeenCalledWith(
        expect.objectContaining({
          priorityFrom: "medium",
          priorityTo: "high",
          page: 1,
        })
      )
    )
    await waitFor(() =>
      expect(
        ownerBody.queryByRole("dialog", { name: "Priority filter" })
      ).not.toBeInTheDocument()
    )
    await waitFor(
      () =>
        expect(
          canvasElement.ownerDocument.body.querySelector(
            "[data-base-ui-focus-guard]"
          )
        ).not.toBeInTheDocument(),
      { timeout: 3_000 }
    )
  },
})

export const SelectionAndPagination = meta.story({
  args: { total: 42 },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("checkbox", {
        name: `Select issue ${fictionalIssueView.number}`,
      })
    )
    await expect(canvas.getByText("1 selected")).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      expect.stringContaining("page=2")
    )
  },
})

export const StickyControlIslands = meta.story({
  play: ({ canvasElement }) =>
    verifyStickyControlIslands({
      canvasElement,
      issueNumber: fictionalIssueView.number,
      issueTitle: fictionalIssueView.title,
    }),
})

export const ColumnVisibilityPersistence = meta.story({
  play: async ({ canvas, canvasElement }) => {
    const ownerBody = within(canvasElement.ownerDocument.body)
    const trigger = canvas.getByRole("button", {
      name: "Choose visible columns",
    })
    await userEvent.click(trigger)
    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-expanded", "true")
    )
    await waitFor(() =>
      expect(
        ownerBody.getByRole("menuitemcheckbox", { name: "Thumbnail" })
      ).toBeVisible()
    )
    const thumbnail = ownerBody.getByRole("menuitemcheckbox", {
      name: "Thumbnail",
    })
    expect(thumbnail).toHaveAttribute("aria-checked", "true")
    expect(thumbnail).toHaveAttribute("data-visibility-icon", "eye")
    await userEvent.click(thumbnail)
    await waitFor(() =>
      expect(
        canvas.queryByAltText("issue-thumbnail.png")
      ).not.toBeInTheDocument()
    )
    expect(trigger).toHaveClass("ring-primary", "text-primary")
    canvasElement.ownerDocument.defaultView?.localStorage.removeItem(
      getDataTableStorageKey(
        fictionalIssueAssignees[0]?.id ?? "user-1",
        "organization-issues",
        2
      )
    )
    if (trigger.getAttribute("aria-expanded") === "true") {
      await userEvent.keyboard("{Escape}")
    }
    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-expanded", "false")
    )
    await waitFor(
      () =>
        expect(
          canvasElement.ownerDocument.body.querySelector(
            "[data-base-ui-focus-guard]"
          )
        ).not.toBeInTheDocument(),
      { timeout: 3_000 }
    )
  },
})

export const ToolbarComposition = meta.story({
  globals: { viewport: { value: "toolbarWide", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    const searchInput = canvas.getByRole("searchbox", {
      name: "Search issues",
    })
    const columns = canvas.getByRole("button", {
      name: "Choose visible columns",
    })
    expect(canvas.queryByText("Primary")).not.toBeInTheDocument()
    expect(canvas.queryByText("View")).not.toBeInTheDocument()
    expect(
      searchInput.closest('[data-slot="data-table-toolbar-group"]')
    ).toBeNull()
    expect(columns.closest('[data-slot="data-table-toolbar-group"]')).toBeNull()

    const toolbar = canvas.getByRole("toolbar", {
      name: "Issue table controls",
    })
    const groups = within(toolbar).getAllByRole("group", {
      name: /^Issue (filters|sorting)$/u,
    })
    expect(groups).toHaveLength(2)
    for (const group of groups) {
      expect(group).toHaveAttribute("data-slot", "data-table-toolbar-group")
      const style = getComputedStyle(group)
      expect(parseFloat(style.borderTopWidth)).toBeGreaterThan(0)
      expect(style.borderTopStyle).not.toBe("none")
    }
    const [filterGroup, sortGroup] = groups
    if (!(filterGroup && sortGroup)) {
      throw new globalThis.Error("Expected filter and sort toolbar groups")
    }
    verifyWideToolbarGroups({ filterGroup, sortGroup })
    const searchRow = searchInput.closest<HTMLElement>(
      '[data-toolbar-row="search"]'
    )
    const controlsRow = filterGroup.closest<HTMLElement>(
      '[data-toolbar-row="controls"]'
    )
    if (!(searchRow && controlsRow)) {
      throw new globalThis.Error("Expected dedicated toolbar rows")
    }
    expect(searchRow.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      controlsRow.getBoundingClientRect().top
    )
    for (const [group, name] of [
      [filterGroup, "Reset filters"],
      [sortGroup, "Reset sort"],
    ] as const) {
      const reset = within(group).getByRole("button", { name })
      const actions = reset.closest<HTMLElement>(
        '[data-slot="data-table-toolbar-group-actions"]'
      )
      if (!actions) {
        throw new globalThis.Error("Expected in-flow toolbar group actions")
      }
      expect(actions.parentElement).toBe(group)
      expect(actions).toHaveClass("ml-auto", "shrink-0")
      expect(actions).not.toHaveClass("basis-full")
      const groupStyle = getComputedStyle(group)
      const groupRect = group.getBoundingClientRect()
      expect(actions.getBoundingClientRect().right).toBeCloseTo(
        groupRect.right -
          parseFloat(groupStyle.paddingRight) -
          parseFloat(groupStyle.borderRightWidth),
        0
      )
      expect(reset.className).toContain("hover:bg-muted")
      expect(reset.className).not.toContain("bg-primary")
    }
    const sortReset = within(sortGroup).getByRole("button", {
      name: "Reset sort",
    })
    const sortSelect = within(sortGroup).getByRole("combobox", {
      name: "Sort issues",
    })
    const sortResetRect = sortReset.getBoundingClientRect()
    const sortSelectRect = sortSelect.getBoundingClientRect()
    expect((sortResetRect.top + sortResetRect.bottom) / 2).toBeCloseTo(
      (sortSelectRect.top + sortSelectRect.bottom) / 2,
      0
    )

    const labels: HTMLElement[] = [
      within(filterGroup).getByText("Filters"),
      within(sortGroup).getByText("Sort"),
    ]
    for (const label of labels) {
      const icon = label.querySelector("svg")
      if (!icon) throw new globalThis.Error("Expected toolbar label icon")
      expect(icon.getBoundingClientRect()).toMatchObject({
        height: 16,
        width: 16,
      })
      expect(getComputedStyle(label).fontSize).toBe(
        getComputedStyle(canvas.getByRole("combobox", { name: "Status" }))
          .fontSize
      )
    }
    expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
      canvasElement.clientWidth
    )
  },
})

export const ToolbarCompositionWrapped = meta.story({
  globals: { viewport: { value: "toolbarWrapped", isRotated: false } },
  play: async ({ canvas }) => {
    const toolbar = canvas.getByRole("toolbar", {
      name: "Issue table controls",
    })
    const [filterGroup, sortGroup] = within(toolbar).getAllByRole("group", {
      name: /^Issue (filters|sorting)$/u,
    })
    if (!(filterGroup && sortGroup)) {
      throw new globalThis.Error("Expected filter and sort toolbar groups")
    }

    verifyWrappedToolbarGroups({ filterGroup, sortGroup })
  },
})

export const SearchClearAndKeyboard = meta.story({
  play: async ({ canvas }) => {
    search.mockClear()
    const searchInput = canvas.getByRole("searchbox", {
      name: "Search issues",
    })
    searchInput.focus()
    await userEvent.type(searchInput, "billing")
    const clear = canvas.getByRole("button", {
      name: "Clear issue search",
    })
    clear.focus()
    await userEvent.keyboard("{Enter}")

    await expect(searchInput).toHaveValue("")
    await expect(searchInput).toHaveFocus()
    await expect(
      canvas.queryByRole("button", { name: "Clear issue search" })
    ).not.toBeInTheDocument()
    await expect(search).toHaveBeenCalledWith("")
  },
})

export const ActiveFilterSummaries = meta.story({
  args: {
    searchState: {
      ...fictionalIssueSearchState,
      statuses: ["open", "closed"],
      priorityFrom: "medium",
      priorityTo: "urgent",
      assignees: ["unassigned", fictionalIssueAssignees[0]?.id ?? "user-1"],
      labels: ["billing", "incident"],
      labelMode: "all",
      dueFrom: "2026-06-07",
      dueTo: "2026-06-18",
    },
  },
  play: async ({ canvas, canvasElement }) => {
    const dotSummaries = canvasElement.querySelectorAll<HTMLElement>(
      '[data-slot="issue-filter-summary-dot"]'
    )
    expect(dotSummaries).toHaveLength(5)
    for (const dot of dotSummaries) {
      expect(dot.getBoundingClientRect()).toMatchObject({
        height: 6,
        width: 6,
      })
      expect(dot).toHaveAttribute("aria-hidden", "true")
    }

    const status = canvas.getByRole("combobox", { name: "Status" })
    expect(status).toHaveAccessibleDescription(
      "Selected statuses: Open, Closed; 2 total"
    )
    const priority = canvas.getByRole("button", { name: "Priority" })
    expect(priority).toHaveAccessibleDescription(
      "Selected priorities: Medium, High, Urgent; 3 total"
    )
    const assignee = canvas.getByRole("button", { name: "Assignee" })
    expect(assignee).toHaveAccessibleDescription(
      `Selected assignees: Unassigned, ${fictionalIssueAssignees[0]?.name ?? "user-1"}; 2 total`
    )
    expect(assignee.querySelectorAll('[data-slot="avatar"]')).toHaveLength(2)
    const assigneeAvatar = assignee.querySelector<HTMLElement>(
      '[data-slot="avatar-group"]'
    )
    const assigneeCount = assignee.querySelector<HTMLElement>(
      '[aria-hidden="true"]:last-child'
    )
    if (!(assigneeAvatar && assigneeCount)) {
      throw new globalThis.Error("Expected assignee summary parts")
    }
    const avatarCenter =
      (assigneeAvatar.getBoundingClientRect().top +
        assigneeAvatar.getBoundingClientRect().bottom) /
      2
    const countCenter =
      (assigneeCount.getBoundingClientRect().top +
        assigneeCount.getBoundingClientRect().bottom) /
      2
    expect(avatarCenter).toBeCloseTo(countCenter, 0)
    const triggerCenter =
      (assignee.getBoundingClientRect().top +
        assignee.getBoundingClientRect().bottom) /
      2
    expect(Math.abs(avatarCenter - triggerCenter)).toBeLessThanOrEqual(1)
    const labels = canvas.getByRole("button", { name: "Labels" })
    expect(labels).toHaveAccessibleDescription(
      "Selected labels: billing, incident; 2 total; match all"
    )
    expect(labels.querySelector('[data-slot="badge"]')).toBeInTheDocument()
    expect(
      canvas.getByRole("button", { name: "Due date" })
    ).toHaveAccessibleDescription("Due date filter: Jun 7 – Jun 18")
    for (const trigger of [assignee, labels]) {
      expect(trigger.scrollWidth).toBeLessThanOrEqual(trigger.clientWidth)
    }
    expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
      canvasElement.clientWidth
    )
  },
})

export const PinnedHeaderAndSelectionBar = meta.story({
  args: { issues: tallIssueViews, total: 42 },
  play: async ({ canvas, canvasElement }) => {
    const ownerWindow = canvasElement.ownerDocument.defaultView
    if (!ownerWindow) {
      throw new globalThis.Error("Expected the Storybook owner window")
    }
    const scrollRegion = canvas.getByRole("region", {
      name: "Organization issues",
    })
    const originalDocumentScroll = {
      left: ownerWindow.scrollX,
      top: ownerWindow.scrollY,
    }
    const originalTableScrollLeft = scrollRegion.scrollLeft
    const columns = canvas.getByRole("button", {
      name: "Choose visible columns",
    })
    const header = columns.closest<HTMLElement>("th")
    const actions = canvas.getByRole("button", {
      name: `Actions for ${fictionalIssueView.title}`,
    })
    let clearSelection: HTMLElement | undefined
    try {
      if (!header) throw new globalThis.Error("Expected actions table header")
      expect(header.getBoundingClientRect().width).toBeCloseTo(48, 0)
      expect(actions.getBoundingClientRect()).toMatchObject({
        height: 32,
        width: 32,
      })
      const headerCenter =
        (header.getBoundingClientRect().left +
          header.getBoundingClientRect().right) /
        2
      const actionCenter =
        (actions.getBoundingClientRect().left +
          actions.getBoundingClientRect().right) /
        2
      expect(headerCenter).toBeCloseTo(actionCenter, 0)
      const headerRight = header.getBoundingClientRect().right

      await userEvent.click(
        canvas.getByRole("checkbox", {
          name: `Select issue ${fictionalIssueView.number}`,
        })
      )
      const status = canvas.getByRole("status", { name: "1 selected" })
      const bar = status.parentElement
      const anchor = bar?.parentElement
      const scope = status.closest<HTMLElement>(
        '[data-slot="issues-table-results-scope"]'
      )
      const footer = canvas.getByLabelText("Issue table footer")
      if (!(bar && anchor && scope)) {
        throw new globalThis.Error(
          "Expected the table-bounded selection anchor"
        )
      }
      clearSelection = within(bar).getByRole("button", {
        name: "Clear",
      })
      const viewportHeight =
        canvasElement.ownerDocument.documentElement.clientHeight
      const scopePageTop =
        ownerWindow.scrollY + scope.getBoundingClientRect().top
      expect(scope.getBoundingClientRect().height).toBeGreaterThan(
        viewportHeight * 1.5
      )

      ownerWindow.scrollTo(0, scopePageTop + viewportHeight / 2)
      await waitFor(() =>
        expect(ownerWindow.scrollY).toBeGreaterThan(scopePageTop)
      )
      const stickyBottom = parseFloat(getComputedStyle(anchor).bottom)
      expect(getComputedStyle(anchor).position).toBe("sticky")
      expect(anchor.getBoundingClientRect().height).toBeGreaterThan(0)
      expect(bar.getBoundingClientRect().bottom).toBeCloseTo(
        viewportHeight - stickyBottom,
        0
      )

      const barLeftBefore = bar.getBoundingClientRect().left
      scrollRegion.scrollLeft = scrollRegion.scrollWidth
      await waitFor(() => expect(scrollRegion.scrollLeft).toBeGreaterThan(0))
      expect(header.getBoundingClientRect().right).toBeCloseTo(headerRight, 0)
      expect(bar.getBoundingClientRect().left).toBeCloseTo(barLeftBefore, 0)

      const scopePageBottom =
        ownerWindow.scrollY + scope.getBoundingClientRect().bottom
      ownerWindow.scrollTo(0, scopePageBottom - viewportHeight + 80)
      await waitFor(() =>
        expect(scope.getBoundingClientRect().bottom).toBeLessThan(
          viewportHeight
        )
      )
      expect(bar.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        scope.getBoundingClientRect().bottom
      )
      expect(bar.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        footer.getBoundingClientRect().top
      )
      expect(
        footer.querySelector('[data-slot="data-table-selection-bar"]')
      ).toBeNull()
    } finally {
      clearSelection?.click()
      scrollRegion.scrollLeft = originalTableScrollLeft
      ownerWindow.scrollTo(
        originalDocumentScroll.left,
        originalDocumentScroll.top
      )
      await waitFor(() => {
        expect(scrollRegion.scrollLeft).toBe(originalTableScrollLeft)
        expect(ownerWindow.scrollY).toBe(originalDocumentScroll.top)
      })
    }
  },
})

export const SortMappingAndFocus = meta.story({
  play: async ({ canvas, canvasElement }) => {
    const ownerBody = within(canvasElement.ownerDocument.body)
    const sort = canvas.getByRole("combobox", { name: "Sort issues" })
    expect(sort).toHaveTextContent("Updated")
    expect(sort).not.toHaveTextContent("updatedAt")
    expect(sort.querySelector("svg")).toBeInTheDocument()

    await userEvent.click(sort)
    const priority = await ownerBody.findByRole("option", { name: "Priority" })
    expect(priority.querySelector("svg")).toBeInTheDocument()
    await userEvent.click(priority)
    await waitFor(() => expect(sort).toHaveFocus())
    expect(changeView).toHaveBeenCalledWith({ sort: "priority", page: 1 })

    const direction = canvas.getByRole("combobox", {
      name: "Set issue sort direction",
    })
    expect(direction).toHaveTextContent("Descending")
    expect(direction.querySelector("svg")).toBeInTheDocument()
    await userEvent.click(direction)
    const ascending = await ownerBody.findByRole("option", {
      name: "Ascending",
    })
    expect(ascending.querySelector("svg")).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(direction).toHaveFocus())
  },
})

export const SearchableFilterLayout = meta.story({
  play: async ({ canvas, canvasElement }) => {
    const ownerBody = within(canvasElement.ownerDocument.body)
    const trigger = canvas.getByRole("button", { name: "Labels" })
    await userEvent.click(trigger)
    const content = await ownerBody.findByRole("dialog", {
      name: "Labels filter",
    })
    const searchGroup = content.querySelector<HTMLElement>(
      '[data-slot="input-group"]'
    )
    const list = content.querySelector<HTMLElement>(
      '[data-slot="combobox-list"]'
    )
    const mode = content.querySelector<HTMLElement>(
      '[data-slot="data-table-faceted-filter-mode"]'
    )
    if (!(searchGroup && list && mode)) {
      throw new globalThis.Error("Expected inset filter sections")
    }
    const option = within(list).getByRole("option", { name: "billing" })
    const modeToggle = within(mode).getByRole("group", {
      name: "Label match mode",
    })
    expect(searchGroup.getBoundingClientRect().left).toBeCloseTo(
      option.getBoundingClientRect().left,
      0
    )
    expect(searchGroup.getBoundingClientRect().right).toBeCloseTo(
      option.getBoundingClientRect().right,
      0
    )
    expect(modeToggle.getBoundingClientRect().left).toBeCloseTo(
      option.getBoundingClientRect().left,
      0
    )
    expect(modeToggle.getBoundingClientRect().right).toBeCloseTo(
      option.getBoundingClientRect().right,
      0
    )
    const labelSearch = within(content).getByRole("combobox", {
      name: "Search labels",
    })
    await userEvent.click(labelSearch)
    await userEvent.type(labelSearch, "bill")
    await expect(labelSearch).toHaveValue("bill")
    await userEvent.keyboard("{ArrowDown}{Enter}")
    expect(option).toHaveAttribute("aria-selected", "true")

    const any = ownerBody.getByRole("button", { name: "Match any" })
    const all = ownerBody.getByRole("button", { name: "Match all" })
    expect(any.getBoundingClientRect().width).toBeCloseTo(
      all.getBoundingClientRect().width,
      0
    )
    expect(any.querySelector("svg")).not.toBeInTheDocument()
    expect(all.querySelector("svg")).not.toBeInTheDocument()
    await userEvent.click(any)
    await userEvent.keyboard("{ArrowRight}")
    await waitFor(() => expect(all).toHaveFocus())
    await userEvent.keyboard("{Enter}")
    expect(all).toHaveAttribute("aria-pressed", "true")
    await userEvent.click(all)
    expect(all).toHaveAttribute("aria-pressed", "true")
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(trigger).toHaveFocus())
  },
})

export const SearchableAssigneeKeyboard = meta.story({
  args: {
    assignees: [...fictionalIssueAssignees, additionalIssueAssignee],
  },
  play: ({ canvasElement }) =>
    verifySearchableAssigneeKeyboard({ canvasElement }),
})

export const DueDateDesktopLayout = meta.story({
  play: async ({ canvas, canvasElement }) => {
    changeView.mockClear()
    const trigger = canvas.getByRole("button", { name: "Due date" })
    await userEvent.click(trigger)
    const content = canvasElement.ownerDocument.querySelector<HTMLElement>(
      '[data-slot="due-date-filter-content"]'
    )
    if (!content) throw new globalThis.Error("Expected due-date filter content")
    const calendars = within(content).getAllByRole("grid")
    expect(calendars).toHaveLength(1)
    const calendar = content.querySelector<HTMLElement>(
      '[data-slot="calendar"]'
    )
    if (!calendar) throw new globalThis.Error("Expected one range calendar")
    const contentStyle = getComputedStyle(content)
    expect(content.getBoundingClientRect().width).toBeCloseTo(
      calendar.getBoundingClientRect().width +
        parseFloat(contentStyle.borderLeftWidth) +
        parseFloat(contentStyle.borderRightWidth),
      0
    )
    expect(content.querySelector('input[type="date"]')).toBeNull()
    expect(
      within(content).queryByRole("group", { name: "Due date preset" })
    ).not.toBeInTheDocument()
    const day = content.querySelector<HTMLButtonElement>("button[data-day]")
    if (!day) throw new globalThis.Error("Expected a calendar day")
    day.focus()
    await userEvent.keyboard("{Enter}")
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(trigger).toHaveFocus())
    await waitFor(() =>
      expect(changeView).toHaveBeenCalledWith(
        expect.objectContaining({
          dueFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u),
          dueTo: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u),
          page: 1,
        })
      )
    )
  },
})

export const DueDateMobileViewport = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    const trigger = canvas.getByRole("button", { name: "Due date" })
    await userEvent.click(trigger)
    const document = canvasElement.ownerDocument
    const content = document.querySelector<HTMLElement>(
      '[data-slot="due-date-filter-content"]'
    )
    if (!content) throw new globalThis.Error("Expected due-date filter content")
    const viewportWidth = document.documentElement.clientWidth
    const viewportHeight = document.documentElement.clientHeight
    const contentRect = content.getBoundingClientRect()
    expect(contentRect.left).toBeGreaterThanOrEqual(15)
    expect(contentRect.right).toBeLessThanOrEqual(viewportWidth - 15)
    expect(contentRect.top).toBeGreaterThanOrEqual(15)
    expect(contentRect.bottom).toBeLessThanOrEqual(viewportHeight - 15)
    expect(getComputedStyle(content).overflowY).toBe("auto")
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      viewportWidth
    )

    const calendars = within(content).getAllByRole("grid")
    expect(calendars).toHaveLength(1)
    const calendar = content.querySelector<HTMLElement>(
      '[data-slot="calendar"]'
    )
    if (!calendar) throw new globalThis.Error("Expected one range calendar")
    const contentStyle = getComputedStyle(content)
    expect(contentRect.width).toBeCloseTo(
      calendar.getBoundingClientRect().width +
        parseFloat(contentStyle.borderLeftWidth) +
        parseFloat(contentStyle.borderRightWidth),
      0
    )
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(trigger).toHaveFocus())
  },
})

export const Empty = meta.story({
  args: { issues: [], total: 0 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No matching issues")).toBeVisible()
  },
})

export const Error = meta.story({
  args: {
    issues: [],
    total: 0,
    error: "The issue list request failed.",
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
    await expect(retry).toHaveBeenCalled()
  },
})

export const Pending = meta.story({
  args: {
    pending: true,
    busyIssueId: fictionalIssueView.id,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "New issue" })
    ).toBeDisabled()
    await expect(
      canvas.getByRole("button", {
        name: `Actions for ${fictionalIssueView.title}`,
      })
    ).toHaveAttribute("aria-busy", "true")
  },
})

export const MobileOverflow = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    const toolbarGroups = canvas.getAllByRole("group", {
      name: /^Issue (filters|sorting)$/u,
    })
    let wrappedGroupCount = 0
    for (const group of toolbarGroups) {
      const actions = group.querySelector<HTMLElement>(
        '[data-slot="data-table-toolbar-group-actions"]'
      )
      if (!actions) {
        throw new globalThis.Error("Expected mobile toolbar group actions")
      }
      expect(getComputedStyle(group).flexWrap).toBe("wrap")
      expect(actions).toHaveClass("ml-auto", "shrink-0")
      expect(actions).not.toHaveClass("basis-full")
      const groupStyle = getComputedStyle(group)
      const groupRect = group.getBoundingClientRect()
      expect(actions.getBoundingClientRect().right).toBeCloseTo(
        groupRect.right -
          parseFloat(groupStyle.paddingRight) -
          parseFloat(groupStyle.borderRightWidth),
        0
      )
      const visibleDirectControls = Array.from(group.children).filter(
        (child): child is HTMLElement => {
          if (!(child instanceof HTMLElement)) return false
          const rect = child.getBoundingClientRect()
          return rect.height > 0 && rect.width > 0
        }
      )
      expect(visibleDirectControls).toContain(actions)
      const rowCenters = visibleDirectControls.reduce<number[]>(
        (centers, control) => {
          const rect = control.getBoundingClientRect()
          const center = (rect.top + rect.bottom) / 2
          if (!centers.some((candidate) => Math.abs(candidate - center) <= 1)) {
            centers.push(center)
          }
          return centers
        },
        []
      )
      if (rowCenters.length > 1) wrappedGroupCount += 1
      expect(group.scrollWidth).toBeLessThanOrEqual(group.clientWidth)
    }
    expect(wrappedGroupCount).toBeGreaterThanOrEqual(1)
    const container = canvas.getByRole("region", {
      name: "Organization issues",
    })
    await waitFor(() =>
      expect(container.scrollWidth).toBeGreaterThan(container.clientWidth)
    )
    expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
      canvasElement.clientWidth
    )
    expect(
      canvasElement.ownerDocument.documentElement.scrollWidth
    ).toBeLessThanOrEqual(
      canvasElement.ownerDocument.documentElement.clientWidth
    )
    const checkbox = canvas.getByRole("checkbox", {
      name: `Select issue ${fictionalIssueView.number}`,
    })
    const actionButton = canvas.getByRole("button", {
      name: `Actions for ${fictionalIssueView.title}`,
    })
    const columns = canvas.getByRole("button", {
      name: "Choose visible columns",
    })
    const actionsHeader = columns.closest<HTMLElement>("th")
    const selectionIsland = checkbox.closest<HTMLElement>(
      '[data-slot="data-table-selection-island"]'
    )
    const actionsIsland = actionButton.closest<HTMLElement>(
      '[data-slot="issue-actions-island"]'
    )
    if (!(selectionIsland && actionsIsland && actionsHeader)) {
      throw new globalThis.Error("Expected both sticky control islands")
    }
    const leftBefore = selectionIsland.getBoundingClientRect().left
    const rightBefore = actionsIsland.getBoundingClientRect().right
    const headerRightBefore = actionsHeader.getBoundingClientRect().right
    container.scrollLeft = container.scrollWidth
    await waitFor(() => expect(container.scrollLeft).toBeGreaterThan(0))
    expect(selectionIsland.getBoundingClientRect().left).toBeCloseTo(
      leftBefore,
      0
    )
    expect(actionsIsland.getBoundingClientRect().right).toBeCloseTo(
      rightBefore,
      0
    )
    expect(actionsHeader.getBoundingClientRect().right).toBeCloseTo(
      headerRightBefore,
      0
    )
    for (const island of [selectionIsland, actionsIsland]) {
      const style = getComputedStyle(island)
      expect(style.borderTopWidth).toBe("0px")
      expect(style.backdropFilter).toContain("blur")
      expect(getComputedColorAlpha(style.backgroundColor)).toBeLessThan(1)
    }
    const selectionInner = selectionIsland.firstElementChild
    if (!(selectionInner instanceof HTMLElement)) {
      throw new globalThis.Error("Expected the selection island inner control")
    }
    for (const [outer, inner] of [
      [selectionIsland, selectionInner],
      [actionsIsland, actionButton],
    ] as const) {
      const outerStyle = getComputedStyle(outer)
      const innerStyle = getComputedStyle(inner)
      expect(parseFloat(outerStyle.borderTopLeftRadius)).toBeCloseTo(
        parseFloat(innerStyle.borderTopLeftRadius) +
          parseFloat(outerStyle.paddingTop)
      )
    }
    expect(checkbox.getBoundingClientRect()).toMatchObject({
      height: 16,
      width: 16,
    })
    expect(actionButton.getBoundingClientRect()).toMatchObject({
      height: 32,
      width: 32,
    })
    expect(actionsHeader.getBoundingClientRect().width).toBeCloseTo(48, 0)

    await userEvent.click(checkbox)
    const selectionStatus = canvas.getByRole("status", { name: "1 selected" })
    const selectionBar = selectionStatus.parentElement
    const selectionAnchor = selectionBar?.parentElement
    const resultsScope = selectionStatus.closest<HTMLElement>(
      '[data-slot="issues-table-results-scope"]'
    )
    if (!(selectionBar && selectionAnchor && resultsScope)) {
      throw new globalThis.Error("Expected a mobile selection bar scope")
    }
    expect(selectionAnchor.getBoundingClientRect().height).toBeGreaterThan(0)
    expect(getComputedStyle(selectionAnchor).position).toBe("sticky")
    expect(selectionAnchor.className).toContain("safe-area-inset-bottom")
    expect(selectionBar.getBoundingClientRect().left).toBeGreaterThanOrEqual(0)
    expect(selectionBar.getBoundingClientRect().right).toBeLessThanOrEqual(
      canvasElement.ownerDocument.documentElement.clientWidth
    )
    expect(selectionBar.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      resultsScope.getBoundingClientRect().bottom
    )
    await userEvent.click(
      within(selectionBar).getByRole("button", { name: "Clear" })
    )
    await expect(
      canvas.queryByRole("status", { name: "1 selected" })
    ).not.toBeInTheDocument()
  },
})
