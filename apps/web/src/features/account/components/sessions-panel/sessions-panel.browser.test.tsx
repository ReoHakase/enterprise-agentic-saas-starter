import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { page } from "vitest/browser"

import { SessionsPanelStoryFixture } from "./test-support/sessions-panel-story-fixture"

afterEach(cleanup)

describe("SessionsPanelの実ブラウザー配置", () => {
  it("モバイルではセッション表だけを横スクロールできる", async () => {
    await page.viewport(390, 844)
    render(<SessionsPanelStoryFixture />)

    const scrollRegion = await screen.findByRole("region", {
      name: "Signed-in device sessions",
    })
    expect(scrollRegion.scrollWidth).toBeGreaterThan(scrollRegion.clientWidth)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    )

    scrollRegion.scrollLeft = 40
    await waitFor(() => expect(scrollRegion.scrollLeft).toBeGreaterThan(0))
  })
})
