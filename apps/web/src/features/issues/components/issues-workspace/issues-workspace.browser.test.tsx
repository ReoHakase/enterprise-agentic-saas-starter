import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { page } from "vitest/browser"

import { TestRouterProvider } from "@/test-support/tanstack-router"

import { fictionalIssueView } from "../../test-support/fixtures"
import {
  activeIssueSearchState,
  getAssigneeSummaryParts,
  getComputedColorAlpha,
  getIssueActionsHeader,
  getIssueControlSurfaces,
  getIssueResultsScope,
  getVisibleDirectControlRowCenters,
  tallIssueViews,
} from "../../test-support/issues-workspace-story-data"
import { IssuesWorkspaceStoryFixture } from "../../test-support/issues-workspace-story-fixture"

afterEach(() => {
  cleanup()
  window.scrollTo(0, 0)
})

const center = (rect: DOMRect, axis: "horizontal" | "vertical") =>
  axis === "horizontal"
    ? (rect.left + rect.right) / 2
    : (rect.top + rect.bottom) / 2

const getToolbarGroups = () => {
  const toolbar = screen.getByRole("toolbar", {
    name: "Issue table controls",
  })
  const [filterGroup, sortGroup] = within(toolbar).getAllByRole("group", {
    name: /^Issue (filters|sorting)$/u,
  })
  if (!(filterGroup && sortGroup)) {
    throw new Error("Expected issue toolbar groups")
  }
  return { filterGroup, sortGroup }
}

const renderIssuesWorkspace = async (
  props: ComponentProps<typeof IssuesWorkspaceStoryFixture> = {}
) => {
  render(
    <TestRouterProvider>
      <IssuesWorkspaceStoryFixture {...props} />
    </TestRouterProvider>
  )
  await screen.findByRole("searchbox", { name: "Search issues" })
}

describe("IssuesWorkspaceの実ブラウザー配置", () => {
  it("広い表示領域では検索行の下にfilterとsortを横並びにする", async () => {
    await page.viewport(2048, 900)
    await renderIssuesWorkspace()

    const search = screen.getByRole("searchbox", { name: "Search issues" })
    const { filterGroup, sortGroup } = getToolbarGroups()
    const filterRect = filterGroup.getBoundingClientRect()
    const sortRect = sortGroup.getBoundingClientRect()
    expect(search.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      filterRect.top
    )
    expect(filterRect.top).toBeCloseTo(sortRect.top, 0)
    expect(filterRect.right).toBeLessThanOrEqual(sortRect.left)

    for (const [group, actionsName] of [
      [filterGroup, "Issue filter actions"],
      [sortGroup, "Issue sort actions"],
    ] as const) {
      const actions = within(group).getByRole("group", { name: actionsName })
      const style = getComputedStyle(group)
      expect(parseFloat(style.borderTopWidth)).toBeGreaterThan(0)
      expect(actions.getBoundingClientRect().right).toBeCloseTo(
        group.getBoundingClientRect().right -
          parseFloat(style.paddingRight) -
          parseFloat(style.borderRightWidth),
        0
      )
    }
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    )
  })

  it("中間の表示領域ではfilterの下にsortを折り返す", async () => {
    await page.viewport(1024, 900)
    await renderIssuesWorkspace()

    const { filterGroup, sortGroup } = getToolbarGroups()
    expect(sortGroup.getBoundingClientRect().top).toBeGreaterThan(
      filterGroup.getBoundingClientRect().bottom
    )
    const filterActions = within(filterGroup).getByRole("group", {
      name: "Issue filter actions",
    })
    expect(getComputedStyle(filterActions).flexBasis).not.toBe("100%")
    expect(filterActions.getBoundingClientRect().width).toBeLessThan(
      filterGroup.getBoundingClientRect().width
    )
  })

  it("有効なfilter要約をtrigger内で同じ高さに揃える", async () => {
    await page.viewport(1024, 900)
    await renderIssuesWorkspace({ searchState: activeIssueSearchState })

    const dots = screen.getAllByTestId("issue-filter-summary-dot")
    expect(dots).toHaveLength(5)
    for (const dot of dots) {
      expect(dot.getBoundingClientRect()).toMatchObject({
        height: 6,
        width: 6,
      })
    }

    const assignee = screen.getByRole("button", { name: "Assignee" })
    const { avatar, count } = getAssigneeSummaryParts(assignee)
    expect(center(avatar.getBoundingClientRect(), "vertical")).toBeCloseTo(
      center(count.getBoundingClientRect(), "vertical"),
      0
    )
    expect(
      Math.abs(
        center(avatar.getBoundingClientRect(), "vertical") -
          center(assignee.getBoundingClientRect(), "vertical")
      )
    ).toBeLessThanOrEqual(1)
    for (const trigger of [
      assignee,
      screen.getByRole("button", { name: "Labels" }),
    ]) {
      expect(trigger.scrollWidth).toBeLessThanOrEqual(trigger.clientWidth)
    }
  })

  it("横スクロール中も選択と行操作のsurfaceを表示領域へ固定する", async () => {
    await page.viewport(1024, 768)
    await renderIssuesWorkspace()
    const user = userEvent.setup()

    const scrollRegion = screen.getByRole("region", {
      name: "Organization issues",
    })
    const checkbox = screen.getByRole("checkbox", {
      name: `Select issue ${fictionalIssueView.number}`,
    })
    const action = screen.getByRole("button", {
      name: `Actions for ${fictionalIssueView.title}`,
    })
    const { actionIsland, selectionIsland } = getIssueControlSurfaces({
      action,
      checkbox,
    })
    const leftBefore = checkbox.getBoundingClientRect().left
    const rightBefore = action.getBoundingClientRect().right
    const surfaceBefore = getComputedStyle(selectionIsland).backgroundColor

    scrollRegion.scrollLeft = scrollRegion.scrollWidth
    await waitFor(() => expect(scrollRegion.scrollLeft).toBeGreaterThan(0))
    expect(checkbox.getBoundingClientRect().left).toBeCloseTo(leftBefore, 0)
    expect(action.getBoundingClientRect().right).toBeCloseTo(rightBefore, 0)
    expect(checkbox.getBoundingClientRect()).toMatchObject({
      height: 16,
      width: 16,
    })
    expect(action.getBoundingClientRect()).toMatchObject({
      height: 32,
      width: 32,
    })
    for (const island of [selectionIsland, actionIsland]) {
      const style = getComputedStyle(island)
      expect(style.backdropFilter).toContain("blur")
      expect(
        getComputedColorAlpha(style.backgroundColor)
      ).toBeGreaterThanOrEqual(0.85)
      expect(getComputedColorAlpha(style.backgroundColor)).toBeLessThan(1)
    }

    await user.click(checkbox)
    await waitFor(() =>
      expect(getComputedStyle(selectionIsland).backgroundColor).not.toBe(
        surfaceBefore
      )
    )
  })

  it("操作列のheaderと行操作を横スクロール中も同じ位置へ固定する", async () => {
    await page.viewport(1024, 768)
    await renderIssuesWorkspace({ issues: tallIssueViews, total: 42 })

    const scrollRegion = screen.getByRole("region", {
      name: "Organization issues",
    })
    const columnTrigger = screen.getByRole("button", {
      name: "Choose visible columns",
    })
    const header = getIssueActionsHeader(columnTrigger)
    const action = screen.getByRole("button", {
      name: `Actions for ${fictionalIssueView.title}`,
    })
    expect(header.getBoundingClientRect().width).toBeCloseTo(48, 0)
    expect(action.getBoundingClientRect()).toMatchObject({
      height: 32,
      width: 32,
    })
    expect(center(header.getBoundingClientRect(), "horizontal")).toBeCloseTo(
      center(action.getBoundingClientRect(), "horizontal"),
      0
    )
    const headerRight = header.getBoundingClientRect().right

    scrollRegion.scrollLeft = scrollRegion.scrollWidth
    await waitFor(() => expect(scrollRegion.scrollLeft).toBeGreaterThan(0))
    expect(header.getBoundingClientRect().right).toBeCloseTo(headerRight, 0)
  })

  it("選択barを表示領域へ固定しtableの末尾で停止する", async () => {
    await page.viewport(1024, 600)
    await renderIssuesWorkspace({ issues: tallIssueViews, total: 42 })
    const user = userEvent.setup()

    await user.click(
      screen.getByRole("checkbox", {
        name: `Select issue ${fictionalIssueView.number}`,
      })
    )
    const status = screen.getByRole("status", { name: "1 selected" })
    const anchor = screen.getByTestId("data-table-selection-anchor")
    const bar = screen.getByTestId("data-table-selection-bar")
    const scope = getIssueResultsScope(status)
    const footer = screen.getByLabelText("Issue table footer")
    const scopePageTop = window.scrollY + scope.getBoundingClientRect().top

    expect(scope.getBoundingClientRect().height).toBeGreaterThan(
      window.innerHeight * 1.5
    )
    window.scrollTo(0, scopePageTop + window.innerHeight / 2)
    await waitFor(() => expect(window.scrollY).toBeGreaterThan(scopePageTop))
    const stickyBottom = parseFloat(getComputedStyle(anchor).bottom)
    expect(getComputedStyle(anchor).position).toBe("sticky")
    expect(bar.getBoundingClientRect().bottom).toBeCloseTo(
      window.innerHeight - stickyBottom,
      0
    )

    const scopePageBottom =
      window.scrollY + scope.getBoundingClientRect().bottom
    window.scrollTo(0, scopePageBottom - window.innerHeight + 80)
    await waitFor(() =>
      expect(scope.getBoundingClientRect().bottom).toBeLessThan(
        window.innerHeight
      )
    )
    expect(bar.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      scope.getBoundingClientRect().bottom
    )
    expect(bar.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      footer.getBoundingClientRect().top
    )
  })

  it("モバイルではtoolbarを折り返してtableのoverflowをpageへ漏らさない", async () => {
    await page.viewport(390, 844)
    await renderIssuesWorkspace()

    const { filterGroup, sortGroup } = getToolbarGroups()
    expect(
      [filterGroup, sortGroup].some(
        (group) => getVisibleDirectControlRowCenters(group).length > 1
      )
    ).toBe(true)
    for (const group of [filterGroup, sortGroup]) {
      expect(getComputedStyle(group).flexWrap).toBe("wrap")
      expect(group.scrollWidth).toBeLessThanOrEqual(group.clientWidth)
    }
    const scrollRegion = screen.getByRole("region", {
      name: "Organization issues",
    })
    expect(scrollRegion.scrollWidth).toBeGreaterThan(scrollRegion.clientWidth)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    )
  })

  it("モバイルでは選択barをsafe area内かつtable内へ収める", async () => {
    await page.viewport(390, 844)
    await renderIssuesWorkspace()
    const user = userEvent.setup()

    await user.click(
      screen.getByRole("checkbox", {
        name: `Select issue ${fictionalIssueView.number}`,
      })
    )
    const status = screen.getByRole("status", { name: "1 selected" })
    const anchor = screen.getByTestId("data-table-selection-anchor")
    const bar = screen.getByTestId("data-table-selection-bar")
    const scope = getIssueResultsScope(status)
    expect(getComputedStyle(anchor).position).toBe("sticky")
    expect(parseFloat(getComputedStyle(anchor).bottom)).toBeGreaterThanOrEqual(
      16
    )
    expect(bar.getBoundingClientRect().left).toBeGreaterThanOrEqual(0)
    expect(bar.getBoundingClientRect().right).toBeLessThanOrEqual(
      window.innerWidth
    )
    expect(bar.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      scope.getBoundingClientRect().bottom
    )
  })
})
