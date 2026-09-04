import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { page } from "vitest/browser"

import { OrganizationsPageStoryFixture } from "./test-support/organizations-page-story-fixture"

afterEach(cleanup)

describe("OrganizationsPageの実ブラウザー配置", () => {
  it("モバイルでは組織表だけを横スクロールできる", async () => {
    await page.viewport(390, 844)
    render(<OrganizationsPageStoryFixture />)

    const scrollRegion = await screen.findByRole("region", {
      name: "Organizations attached to your account",
    })
    expect(scrollRegion.scrollWidth).toBeGreaterThan(scrollRegion.clientWidth)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    )

    scrollRegion.scrollLeft = 40
    await waitFor(() => expect(scrollRegion.scrollLeft).toBeGreaterThan(0))
  })
})
