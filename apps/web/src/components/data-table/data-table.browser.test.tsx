import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { DataTableStoryFixture } from "@/test-support/data-table-story-fixture"

afterEach(cleanup)

describe("DataTableの実ブラウザー配置", () => {
  it("横スクロールしても選択列と操作列を表示領域へ固定する", async () => {
    render(
      <div className="w-80 max-w-full overflow-x-hidden">
        <DataTableStoryFixture selectable interactive wide />
      </div>
    )

    const container = await screen.findByRole("region", {
      name: "Example data",
    })
    expect(container.scrollWidth).toBeGreaterThan(container.clientWidth)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    )

    const selection = screen.getByRole("checkbox", {
      name: "Select Billing webhook",
    })
    const actionButton = screen.getByRole("button", {
      name: "Actions for Billing webhook",
    })
    const leftBefore = selection.getBoundingClientRect().left
    const rightBefore = actionButton.getBoundingClientRect().right

    container.scrollLeft = container.scrollWidth
    await waitFor(() => expect(container.scrollLeft).toBeGreaterThan(0))
    expect(selection.getBoundingClientRect().left).toBeCloseTo(leftBefore, 0)
    expect(actionButton.getBoundingClientRect().right).toBeCloseTo(
      rightBefore,
      0
    )
  })
})
