import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { page } from "vitest/browser"

import { TestRouterProvider } from "@/test-support/tanstack-router"

import { MembersPageStoryFixture } from "./test-support/members-page-story-fixture"

afterEach(cleanup)

describe("MembersPageの実ブラウザー配置", () => {
  it("モバイルではメンバー表と招待表を個別に横スクロールできる", async () => {
    await page.viewport(390, 844)
    render(
      <TestRouterProvider>
        <MembersPageStoryFixture />
      </TestRouterProvider>
    )

    const scrollRegions = await Promise.all([
      screen.findByRole("region", { name: "Members of Acme Cloud" }),
      screen.findByRole("region", { name: "Invitations for Acme Cloud" }),
    ])
    for (const scrollRegion of scrollRegions) {
      expect(scrollRegion.scrollWidth).toBeGreaterThan(scrollRegion.clientWidth)
      scrollRegion.scrollLeft = 40
    }
    await Promise.all(
      scrollRegions.map((scrollRegion) =>
        waitFor(() => expect(scrollRegion.scrollLeft).toBeGreaterThan(0))
      )
    )
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    )
  })
})
