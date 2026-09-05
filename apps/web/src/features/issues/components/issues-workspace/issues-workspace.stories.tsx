import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"
import { AgentFormRegistryProvider } from "@/features/agent"

import {
  fictionalIssueAssignees,
  fictionalIssueSearchState,
  fictionalIssueView,
} from "../../test-support/fixtures"
import {
  activeIssueSearchState,
  tallIssueViews,
} from "../../test-support/issues-workspace-story-data"
import { IssuesWorkspaceStoryFixture } from "../../test-support/issues-workspace-story-fixture"
import {
  additionalIssueAssignee,
  issueWorkspaceViewportOptions,
  verifySearchableAssigneeKeyboard,
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
    const ownerBody = within(canvasElement.ownerDocument.body)

    await step("行操作メニューを開閉してフォーカスを戻す", async () => {
      const actions = canvas.getByRole("button", {
        name: `Actions for ${fictionalIssueView.title}`,
      })
      await userEvent.click(actions)
      const menu = await ownerBody.findByRole("menu", {
        name: `Actions for ${fictionalIssueView.title}`,
      })
      await waitFor(() => expect(menu).toBeVisible())
      await waitFor(() => expect(menu).toHaveFocus())
      await userEvent.keyboard("{Escape}")
      await waitFor(() =>
        expect(
          ownerBody.queryByRole("menu", {
            name: `Actions for ${fictionalIssueView.title}`,
          })
        ).not.toBeInTheDocument()
      )
      await waitFor(() => expect(actions).toHaveFocus())
    })
  },
})

export const FacetedFilters = meta.story({
  play: async ({ canvas, canvasElement, step }) => {
    await step("キーボードで複数のStatusを選びトリガーへ戻る", async () => {
      const ownerBody = within(canvasElement.ownerDocument.body)
      const trigger = canvas.getByRole("combobox", { name: "Status" })
      await userEvent.click(trigger)
      const inProgress = await ownerBody.findByRole("option", {
        name: "In progress",
      })
      await userEvent.keyboard("i")
      await waitFor(() => expect(inProgress).toHaveFocus())
      await userEvent.keyboard("{Enter}")
      const closed = ownerBody.getByRole("option", { name: "Closed" })
      await userEvent.keyboard("{ArrowDown}")
      await waitFor(() => expect(closed).toHaveFocus())
      await userEvent.keyboard("{Enter}")
      await userEvent.keyboard("{Escape}")
      await waitFor(() => expect(trigger).toHaveFocus())
      await waitFor(() =>
        expect(ownerBody.queryByRole("dialog")).not.toBeInTheDocument()
      )
    })
  },
})

export const InclusivePriorityRange = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, canvasElement, step }) => {
    await step(
      "優先度rangeの初期focusとTab順を維持してトリガーへ戻す",
      async () => {
        const ownerBody = within(canvasElement.ownerDocument.body)
        const trigger = canvas.getByRole("button", { name: "Priority" })
        await userEvent.click(trigger)
        const sliders = await ownerBody.findAllByRole("slider")
        expect(sliders).toHaveLength(2)
        await expect(sliders[0]).toHaveFocus()
        const maximumSlider = sliders[1]
        if (!maximumSlider)
          throw new globalThis.Error("Expected a maximum priority slider")
        await userEvent.keyboard("{Tab}")
        await expect(maximumSlider).toHaveFocus()
        await userEvent.keyboard("{Escape}")
        await waitFor(() => expect(trigger).toHaveFocus())
      }
    )
  },
})

export const PrioritySingleValueKeyboard = meta.story({
  play: async ({ canvas, canvasElement, step }) => {
    await step("優先度の単一値をroving focusで選択する", async () => {
      const ownerBody = within(canvasElement.ownerDocument.body)
      await userEvent.click(canvas.getByRole("button", { name: "Priority" }))
      const sliders = await ownerBody.findAllByRole("slider")
      const urgent = ownerBody.getByRole("button", { name: "Only Urgent" })
      const medium = ownerBody.getByRole("button", { name: "Only Medium" })
      await expect(sliders[0]).toHaveFocus()
      await userEvent.keyboard("{Tab}{Tab}")
      await expect(urgent).toHaveFocus()
      await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}")
      await expect(medium).toHaveFocus()
      await userEvent.keyboard("{Escape}")
      await waitFor(() =>
        expect(ownerBody.queryByRole("dialog")).not.toBeInTheDocument()
      )
    })
  },
})

export const SelectionAndPagination = meta.story({
  args: { total: 42 },
})

export const StickyControlIslands = meta.story({
  render: (args) => <IssuesWorkspaceStoryFixture {...args} />,
})

export const ColumnVisibilityFocusReturn = meta.story({
  play: async ({ canvas, canvasElement, step }) => {
    await step(
      "列表示メニューを閉じるとトリガーへフォーカスを戻す",
      async () => {
        const ownerBody = within(canvasElement.ownerDocument.body)
        const trigger = canvas.getByRole("button", {
          name: "Choose visible columns",
        })
        await userEvent.click(trigger)
        await ownerBody.findByRole("menuitemcheckbox", {
          name: "Thumbnail",
        })
        await userEvent.keyboard("{Escape}")
        await waitFor(() =>
          expect(ownerBody.queryByRole("menu")).not.toBeInTheDocument()
        )
        await waitFor(() => expect(trigger).toHaveFocus())
      }
    )
  },
})

export const ToolbarComposition = meta.story({
  globals: { viewport: { value: "toolbarWide", isRotated: false } },
  render: (args) => <IssuesWorkspaceStoryFixture {...args} />,
})

export const ToolbarCompositionWrapped = meta.story({
  globals: { viewport: { value: "toolbarWrapped", isRotated: false } },
  render: (args) => <IssuesWorkspaceStoryFixture {...args} />,
})

export const SearchClearAndKeyboard = meta.story({
  play: async ({ canvas, step }) => {
    await step(
      "検索語をキーボードで消去すると入力へフォーカスを戻す",
      async () => {
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

        await expect(searchInput).toHaveFocus()
      }
    )
  },
})

export const ActiveFilterSummaries = meta.story({
  args: { searchState: activeIssueSearchState },
  render: (args) => <IssuesWorkspaceStoryFixture {...args} />,
})

export const PinnedHeaderAndSelectionBar = meta.story({
  args: { issues: tallIssueViews, total: 42 },
  render: (args) => <IssuesWorkspaceStoryFixture {...args} />,
})

export const SortMappingAndFocus = meta.story({
  play: async ({ canvas, canvasElement, step }) => {
    await step("並び替え項目を選ぶとトリガーへフォーカスを戻す", async () => {
      const ownerBody = within(canvasElement.ownerDocument.body)
      const sort = canvas.getByRole("combobox", { name: "Sort issues" })

      await userEvent.click(sort)
      const priority = await ownerBody.findByRole("option", {
        name: "Priority",
      })
      await userEvent.click(priority)
      await waitFor(() => expect(sort).toHaveFocus())
    })
  },
})

export const SortDirectionFocusReturn = meta.story({
  play: async ({ canvas, canvasElement, step }) => {
    await step("並び替え方向を閉じるとトリガーへフォーカスを戻す", async () => {
      const ownerBody = within(canvasElement.ownerDocument.body)
      const direction = canvas.getByRole("combobox", {
        name: "Set issue sort direction",
      })
      await userEvent.click(direction)
      await ownerBody.findByRole("option", { name: "Ascending" })
      await userEvent.keyboard("{Escape}")
      await waitFor(() => expect(direction).toHaveFocus())
      await waitFor(() =>
        expect(ownerBody.queryByRole("listbox")).not.toBeInTheDocument()
      )
    })
  },
})

export const SearchableFilterLayout = meta.story({
  play: async ({ canvas, canvasElement, step }) => {
    await step("ラベルfilterの各領域を同じinsetへ配置する", async () => {
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
      const any = ownerBody.getByRole("button", { name: "Match any" })
      const all = ownerBody.getByRole("button", { name: "Match all" })
      expect(any.getBoundingClientRect().width).toBeCloseTo(
        all.getBoundingClientRect().width,
        0
      )
      await userEvent.click(trigger)
      await waitFor(() => expect(content).not.toBeInTheDocument())
    })
  },
})

export const SearchableLabelKeyboard = meta.story({
  play: async ({ canvas, canvasElement, step }) => {
    await step("ラベルを検索してキーボードで選択する", async () => {
      const ownerBody = within(canvasElement.ownerDocument.body)
      const trigger = canvas.getByRole("button", { name: "Labels" })
      await userEvent.click(trigger)
      const content = await ownerBody.findByRole("dialog", {
        name: "Labels filter",
      })
      const labelSearch = within(content).getByRole("combobox", {
        name: "Search labels",
      })
      await userEvent.click(labelSearch)
      await userEvent.type(labelSearch, "bill")
      await userEvent.keyboard("{ArrowDown}{Enter}")
      const billing = within(content).getByRole("option", { name: "billing" })
      await expect(labelSearch).toHaveFocus()
      await expect(labelSearch).toHaveAttribute(
        "aria-activedescendant",
        billing.id
      )
      await userEvent.keyboard("{Escape}{Escape}")
      await waitFor(() => expect(content).not.toBeInTheDocument())
      await expect(trigger).toHaveFocus()
    })
  },
})

export const LabelMatchModeKeyboard = meta.story({
  play: async ({ canvas, canvasElement, step }) => {
    await step("ラベル一致方法をroving focusで移動する", async () => {
      const ownerBody = within(canvasElement.ownerDocument.body)
      await userEvent.click(canvas.getByRole("button", { name: "Labels" }))
      const content = await ownerBody.findByRole("dialog", {
        name: "Labels filter",
      })
      const labelSearch = within(content).getByRole("combobox", {
        name: "Search labels",
      })
      await waitFor(() => expect(labelSearch).toHaveFocus())
      const any = await ownerBody.findByRole("button", { name: "Match any" })
      const all = ownerBody.getByRole("button", { name: "Match all" })
      await userEvent.click(any)
      await waitFor(() => expect(any).toHaveFocus())
      await userEvent.keyboard("{ArrowRight}")
      await waitFor(() => expect(all).toHaveFocus())
      await userEvent.keyboard("{Escape}")
      await waitFor(() => expect(content).not.toBeInTheDocument())
    })
  },
})

export const SearchableAssigneeKeyboard = meta.story({
  args: {
    assignees: [...fictionalIssueAssignees, additionalIssueAssignee],
  },
  play: async ({ canvasElement, step }) => {
    await step("担当者を検索してキーボードで選択する", async () => {
      await verifySearchableAssigneeKeyboard({ canvasElement })
    })
  },
})

export const DueDateDesktopLayout = meta.story({
  play: async ({ canvas, canvasElement, step }) => {
    await step(
      "デスクトップで期日フィルターをcalendar幅に合わせる",
      async () => {
        const trigger = canvas.getByRole("button", { name: "Due date" })
        await userEvent.click(trigger)
        const content = canvasElement.ownerDocument.querySelector<HTMLElement>(
          '[data-slot="due-date-filter-content"]'
        )
        if (!content)
          throw new globalThis.Error("Expected due-date filter content")
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
        await userEvent.click(trigger)
        await waitFor(() => expect(content).not.toBeInTheDocument())
      }
    )
  },
})

export const DueDateMobileViewport = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas, canvasElement, step }) => {
    await step("モバイルで期日フィルターを表示領域内に収める", async () => {
      const trigger = canvas.getByRole("button", { name: "Due date" })
      await userEvent.click(trigger)
      const document = canvasElement.ownerDocument
      const content = document.querySelector<HTMLElement>(
        '[data-slot="due-date-filter-content"]'
      )
      if (!content)
        throw new globalThis.Error("Expected due-date filter content")
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
      await userEvent.click(trigger)
      await waitFor(() => expect(content).not.toBeInTheDocument())
    })
  },
})

export const Empty = meta.story({
  args: { issues: [], total: 0 },
})

export const Error = meta.story({
  args: {
    issues: [],
    total: 0,
    error: "The issue list request failed.",
  },
})

export const Pending = meta.story({
  args: {
    pending: true,
    busyIssueId: fictionalIssueView.id,
  },
})

export const MobileOverflow = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: (args) => <IssuesWorkspaceStoryFixture {...args} />,
})
