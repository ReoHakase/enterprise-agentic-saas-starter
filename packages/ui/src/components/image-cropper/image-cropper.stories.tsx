import { expect, fn, userEvent, waitFor } from "storybook/test"

import preview from "#storybook/preview"

import { ImageCropper } from "./image-cropper"

const validSource = new Blob(
  [
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">',
    '<rect width="800" height="800" fill="#e5e7eb"/>',
    '<circle cx="400" cy="320" r="180" fill="#737373"/>',
    "</svg>",
  ],
  { type: "image/svg+xml" }
)
const invalidSource = new Blob(["not an image"], { type: "image/png" })

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
    source: validSource,
    zoom: 1,
  },
  argTypes: { source: { control: false } },
})

export const Rounded = meta.story({
  args: { shape: "rounded" },
  play: async ({ args, canvas, step }) => {
    await step("Pan the image with the keyboard", async () => {
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
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("group", { name: "Image crop area" })
    ).toHaveAttribute("aria-disabled", "true")
  },
})

export const DecodeError = meta.story({
  args: { source: invalidSource },
  play: async ({ args, canvasElement }) => {
    const cropper = canvasElement.querySelector("[data-slot=image-cropper]")
    if (!cropper) throw new Error("Image cropper was not rendered")
    await waitFor(() =>
      expect(cropper).toHaveAttribute("data-source-status", "error")
    )
    await expect(args.onSourceError).toHaveBeenCalledOnce()
  },
})
