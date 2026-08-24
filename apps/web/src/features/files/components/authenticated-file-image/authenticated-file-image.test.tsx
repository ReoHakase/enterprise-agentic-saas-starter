import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  buildFileImageSourceSet,
  getFilePreviewCandidates,
} from "../authenticated-file-image-source/authenticated-file-image-source"
import { AuthenticatedFileImage } from "./authenticated-file-image"

const file = {
  id: "file-1",
  filename: "diagram.png",
  imageWidth: 500,
  imageHeight: 300,
}

describe("AuthenticatedFileImageの契約", () => {
  it.each([
    {
      caseLabel: "最小preview幅未満の画像",
      width: 200,
      expected: [{ requestedWidth: 360, descriptorWidth: 200 }],
    },
    {
      caseLabel: "preview幅の間にある画像",
      width: 500,
      expected: [
        { requestedWidth: 360, descriptorWidth: 360 },
        { requestedWidth: 720, descriptorWidth: 500 },
      ],
    },
    {
      caseLabel: "最大preview幅と同じ画像",
      width: 2_400,
      expected: [
        { requestedWidth: 360, descriptorWidth: 360 },
        { requestedWidth: 720, descriptorWidth: 720 },
        { requestedWidth: 1200, descriptorWidth: 1200 },
        { requestedWidth: 2400, descriptorWidth: 2400 },
      ],
    },
    {
      caseLabel: "最大preview幅を超える画像",
      width: 3_200,
      expected: [
        { requestedWidth: 360, descriptorWidth: 360 },
        { requestedWidth: 720, descriptorWidth: 720 },
        { requestedWidth: 1200, descriptorWidth: 1200 },
        { requestedWidth: 2400, descriptorWidth: 2400 },
      ],
    },
  ])("$caseLabelの候補をAPI共通widthから構築する", ({ expected, width }) => {
    expect(getFilePreviewCandidates(width)).toEqual(expected)
  })

  it("認証付きAPIのsrcと呼び出し側の寸法をDOMへ反映する", () => {
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
  })

  it("認証付きpreview URLからsrcsetを構築する", () => {
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
