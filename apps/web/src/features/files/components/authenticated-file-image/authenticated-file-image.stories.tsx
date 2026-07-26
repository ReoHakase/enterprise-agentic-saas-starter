import { http, HttpResponse } from "msw"
import { expect } from "storybook/test"

import preview from "#storybook/preview"

import { fictionalImageFile } from "../../test-support/fixtures"
import { AuthenticatedFileImage } from "./authenticated-file-image"

const meta = preview.meta({
  title: "Web/Files/Authenticated File Image",
  component: AuthenticatedFileImage,
  tags: ["autodocs"],
  args: {
    file: fictionalImageFile,
    organizationId: "org_01K1ACMECLOUD0000000000",
    sizes: "(max-width: 640px) 100vw, 640px",
    className: "max-h-80 max-w-xl rounded-xl border object-contain",
  },
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas }) => {
    const image = canvas.getByRole("img", {
      name: "tenant-architecture.png",
    })
    await expect(image).toHaveAttribute("srcset")
    await expect(image).toHaveAttribute("sizes")
  },
})

export const ImageFailure = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.get(
        "*/files/organizations/:organizationId/:fileId/preview/:size",
        () => HttpResponse.error()
      )
    )
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("img", { name: "tenant-architecture.png" })
    ).toBeInTheDocument()
  },
})
