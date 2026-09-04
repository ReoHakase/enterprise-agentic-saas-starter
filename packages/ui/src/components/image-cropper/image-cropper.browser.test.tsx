import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { invalidImageCropSource } from "../../test-support/image-crop-story-fixture"
import {
  ImageCropper,
  type ImageCropperProps,
  type ImageCropPoint,
} from "./image-cropper"

const initialCrop: ImageCropPoint = { x: 0, y: 0 }

afterEach(cleanup)

describe("ImageCropperの実ブラウザーdecode", () => {
  it("画像をdecodeできないとエラーを通知する", async () => {
    const onSourceError =
      vi.fn<NonNullable<ImageCropperProps["onSourceError"]>>()

    render(
      <ImageCropper
        crop={initialCrop}
        onCropChange={vi.fn<ImageCropperProps["onCropChange"]>()}
        onCropComplete={vi.fn<ImageCropperProps["onCropComplete"]>()}
        onSourceError={onSourceError}
        onZoomChange={vi.fn<ImageCropperProps["onZoomChange"]>()}
        source={invalidImageCropSource}
        zoom={1}
      />
    )

    await waitFor(() => expect(onSourceError).toHaveBeenCalled())
  })
})
