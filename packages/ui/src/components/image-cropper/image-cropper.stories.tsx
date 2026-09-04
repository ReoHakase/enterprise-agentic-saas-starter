import { expect, fn, userEvent, waitFor } from "storybook/test"

import preview from "#storybook/preview"

import {
  invalidImageCropSource,
  validImageCropSource,
} from "../../test-support/image-crop-story-fixture"
import { ImageCropper } from "./image-cropper"

const meta = preview.meta({
  title: "Components/Image Cropper",
  component: ImageCropper,
  tags: ["autodocs"],
  args: {
    crop: { x: 0, y: 0 },
    onCropChange: fn(),
    onCropComplete: fn(),
    onSourceError: fn(),
    onZoomChange: fn(),
    source: validImageCropSource,
    zoom: 1,
  },
  argTypes: { source: { control: false } },
})

export const Rounded = meta.story({
  args: { shape: "rounded" },
  play: async ({ args, canvas, step }) => {
    await step("キーボードで画像を移動する", async () => {
      const cropArea = await canvas.findByRole("group", {
        name: "Image crop area",
      })
      await waitFor(() =>
        expect(cropArea.closest("[data-source-status]")).toHaveAttribute(
          "data-source-status",
          "ready"
        )
      )
      cropArea.focus()
      await userEvent.keyboard("{ArrowRight}")
      await expect(args.onCropChange).toHaveBeenCalled()
    })
  },
})

export const Circular = meta.story({
  args: { shape: "circle", zoom: 1.5 },
})

export const Disabled = meta.story({
  args: { disabled: true },
})

export const DecodeError = meta.story({
  args: { source: invalidImageCropSource },
})
