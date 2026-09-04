import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { page } from "vitest/browser"

import { ConsoleFrameStoryFixture } from "./test-support/console-frame-story-fixture"

describe("ConsoleFrameの実ブラウザー配置", () => {
  it("ヘッダーの背景拡張は上部余白を覆う", async () => {
    await page.viewport(1024, 768)
    render(<ConsoleFrameStoryFixture />)
    const header = screen.getByRole("banner")

    const headerStyle = getComputedStyle(header)
    const extensionStyle = getComputedStyle(header, "::before")
    expect(extensionStyle.top).toBe("-8px")
    expect(extensionStyle.height).toBe("8px")
    expect(extensionStyle.backgroundColor).toBe(headerStyle.backgroundColor)
    expect(extensionStyle.backdropFilter).toBe(headerStyle.backdropFilter)
  })
})
