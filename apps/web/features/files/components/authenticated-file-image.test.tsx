import { FILE_PREVIEW_WIDTHS } from "@enterprise-agentic-saas/api/client"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AuthenticatedFileImage } from "./authenticated-file-image"
import {
  buildFileImageSourceSet,
  getFilePreviewCandidates,
} from "./authenticated-file-image-source"

const file = {
  id: "file-1",
  filename: "diagram.png",
  imageWidth: 500,
  imageHeight: 300,
}

describe("authenticated file image", () => {
  it("uses the single API width allowlist without context-specific mappings", () => {
    expect(FILE_PREVIEW_WIDTHS).toEqual([360, 720, 1200, 2400])
    expect(getFilePreviewCandidates(200)).toEqual([
      { requestedWidth: 360, descriptorWidth: 200 },
    ])
    expect(getFilePreviewCandidates(500)).toEqual([
      { requestedWidth: 360, descriptorWidth: 360 },
      { requestedWidth: 720, descriptorWidth: 500 },
    ])
    expect(getFilePreviewCandidates(2_400)).toEqual([
      { requestedWidth: 360, descriptorWidth: 360 },
      { requestedWidth: 720, descriptorWidth: 720 },
      { requestedWidth: 1200, descriptorWidth: 1200 },
      { requestedWidth: 2400, descriptorWidth: 2400 },
    ])
    expect(getFilePreviewCandidates(3_200)).toEqual([
      { requestedWidth: 360, descriptorWidth: 360 },
      { requestedWidth: 720, descriptorWidth: 720 },
      { requestedWidth: 1200, descriptorWidth: 1200 },
      { requestedWidth: 2400, descriptorWidth: 2400 },
    ])
  })

  it("builds authenticated API sources and keeps sizes at the call site", () => {
    render(
      <AuthenticatedFileImage
        file={file}
        organizationId="org alpha"
        sizes="(max-width: 640px) 100vw, 320px"
      />
    )

    const image = screen.getByRole("img", { name: "diagram.png" })
    expect(image).toHaveAttribute("sizes", "(max-width: 640px) 100vw, 320px")
    expect(image).toHaveAttribute("width", "500")
    expect(image).toHaveAttribute("height", "300")
    expect(image.getAttribute("src")).toContain(
      "/files/organizations/org%20alpha/file-1/preview/360"
    )
    expect(
      buildFileImageSourceSet(
        file,
        "org alpha",
        "https://api.example.test/base"
      )
    ).toBe(
      "https://api.example.test/base/files/organizations/org%20alpha/file-1/preview/360 360w, " +
        "https://api.example.test/base/files/organizations/org%20alpha/file-1/preview/720 500w"
    )
  })
})
