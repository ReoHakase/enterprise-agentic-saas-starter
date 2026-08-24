import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { invalidImageCropSource } from "../../test-support/image-crop-story-fixture"
import { ImageCropDialog, type ImageCropDialogProps } from "./image-crop-dialog"

afterEach(cleanup)

describe("ImageCropDialogの実ブラウザーdecode", () => {
  it("画像をdecodeできないと確定を無効にしてエラーを通知する", async () => {
    const onError = vi.fn<NonNullable<ImageCropDialogProps["onError"]>>()

    render(
      <ImageCropDialog
        onConfirm={vi.fn<ImageCropDialogProps["onConfirm"]>()}
        onError={onError}
        onOpenChange={vi.fn<ImageCropDialogProps["onOpenChange"]>()}
        open
        outputSize={512}
        source={invalidImageCropSource}
      />
    )

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The image could not be loaded. Choose a different image."
    )
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Use image" })).toBeDisabled()
    )
    expect(onError).toHaveBeenCalledOnce()
  })
})
