import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { page } from "vitest/browser"

import { SidebarStoryFixture } from "./test-support/sidebar-story-fixture"

afterEach(cleanup)

describe("Sidebarの実ブラウザー配置", () => {
  it("折りたたみ時のidentityを32pxの操作領域内へ整列する", async () => {
    await page.viewport(1024, 768)
    render(<SidebarStoryFixture defaultOpen={false} />)

    const identity = screen.getByText("A", { selector: "span" })
    const identityButton = screen.getByRole("button", {
      name: "A Acme Cloud",
    })

    await waitFor(() => {
      const identityRect = identity.getBoundingClientRect()
      const buttonRect = identityButton.getBoundingClientRect()
      expect(Math.abs(buttonRect.width - 32)).toBeLessThanOrEqual(1)
      expect(Math.abs(buttonRect.height - 32)).toBeLessThanOrEqual(1)
      expect(Math.abs(identityRect.width - 32)).toBeLessThanOrEqual(1)
      expect(Math.abs(identityRect.height - 32)).toBeLessThanOrEqual(1)
      expect(Math.abs(identityRect.left - buttonRect.left)).toBeLessThanOrEqual(
        1
      )
      expect(Math.abs(identityRect.top - buttonRect.top)).toBeLessThanOrEqual(1)
    })
  })
})
