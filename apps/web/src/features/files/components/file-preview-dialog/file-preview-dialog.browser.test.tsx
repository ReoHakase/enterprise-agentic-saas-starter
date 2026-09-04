import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { FilePreviewDialogStoryFixture } from "./test-support/file-preview-dialog-story-fixture"

afterEach(cleanup)

describe("FilePreviewDialogの実ブラウザー配置", () => {
  it("画像previewを文書の表示領域内へ収める", () => {
    render(<FilePreviewDialogStoryFixture />)

    const dialog = screen.getByRole("dialog", {
      name: "tenant-architecture.png",
    })
    const rect = dialog.getBoundingClientRect()
    const viewportRect = document.documentElement.getBoundingClientRect()
    expect(rect.left).toBeGreaterThanOrEqual(viewportRect.left)
    expect(rect.top).toBeGreaterThanOrEqual(viewportRect.top)
    expect(rect.right).toBeLessThanOrEqual(viewportRect.right)
    expect(rect.bottom).toBeLessThanOrEqual(viewportRect.bottom)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth
    )
  })
})
