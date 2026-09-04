import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { page } from "vitest/browser"

import { McpOAuthScopeConsentStoryFixture } from "./test-support/mcp-oauth-authorization-story-fixture"

afterEach(cleanup)

describe("MCP OAuth consentの実ブラウザー配置", () => {
  it("モバイルではscope表だけを横スクロールできる", async () => {
    await page.viewport(390, 844)
    render(<McpOAuthScopeConsentStoryFixture />)

    const scrollRegion = await screen.findByRole("region", {
      name: "Requested access",
    })
    expect(scrollRegion.scrollWidth).toBeGreaterThan(scrollRegion.clientWidth)
    scrollRegion.scrollLeft = 40
    await waitFor(() => expect(scrollRegion.scrollLeft).toBeGreaterThan(0))
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    )
  })
})
