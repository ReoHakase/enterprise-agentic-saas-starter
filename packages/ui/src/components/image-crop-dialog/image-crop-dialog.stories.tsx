import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import { ImageCropDialog } from "./image-crop-dialog"

const source = new Blob(
  [
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">',
    '<rect width="800" height="800" fill="#e5e7eb"/>',
    '<circle cx="400" cy="320" r="180" fill="#737373"/>',
    '<rect x="180" y="520" width="440" height="180" rx="90" fill="#404040"/>',
    "</svg>",
  ],
  { type: "image/svg+xml" }
)
const invalidSource = new Blob(["not an image"], { type: "image/png" })

const meta = preview.meta({
  title: "Components/Image Crop Dialog",
  component: ImageCropDialog,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    onConfirm: fn(),
    onError: fn(),
    onOpenChange: fn(),
    open: true,
    outputSize: 512,
    source,
  },
  argTypes: {
    source: { control: false },
  },
})

export const Circular = meta.story({
  args: { shape: "circle" },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = await body.findByRole("dialog", { name: "Crop image" })
    await expect(dialog).toHaveAttribute("data-motion", "fade")
    await waitFor(() => expect(dialog).toBeVisible())
    expect(dialog.getBoundingClientRect().height).toBeLessThanOrEqual(
      (canvasElement.ownerDocument.defaultView?.innerHeight ?? 0) - 32 + 1
    )
    const slider = body.getByRole("slider", { name: "Zoom" })
    await expect(slider).toBeEnabled()
    const cropArea = await body.findByRole("group", {
      name: "Image crop area",
    })
    await expect(cropArea).toBeVisible()
    await expect(cropArea).toHaveAccessibleDescription(
      "Drag the image, or focus the crop area and use the arrow keys to adjust its position."
    )
    await expect(document.activeElement).not.toBe(document.body)

    const confirm = body.getByRole("button", { name: "Use image" })
    await waitFor(() => expect(confirm).toBeEnabled())
    slider.focus()
    await expect(slider).toHaveFocus()
    await userEvent.keyboard("{ArrowRight}")
    await userEvent.click(confirm)
    await waitFor(() => expect(args.onConfirm).toHaveBeenCalledOnce())

    const result = args.onConfirm.mock.calls[0]?.[0]
    await expect(result).toMatchObject({ height: 512, width: 512 })
    await expect(args.onError).not.toHaveBeenCalled()
  },
})

export const RoundedSquare = meta.story({
  args: { shape: "rounded" },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = await body.findByRole("dialog", { name: "Crop image" })
    await waitFor(() => expect(dialog).toBeVisible())
    const cropArea = await body.findByRole("group", {
      name: "Image crop area",
    })
    await expect(cropArea).toBeVisible()
    expect(getComputedStyle(cropArea).borderTopLeftRadius).toBe("22%")
    await waitFor(() =>
      expect(body.getByRole("button", { name: "Use image" })).toBeEnabled()
    )
  },
})

export const DecodeError = meta.story({
  args: { source: invalidSource },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await body.findByRole("dialog", { name: "Crop image" })

    await expect(await body.findByRole("alert")).toHaveTextContent(
      "The image could not be loaded. Choose a different image."
    )
    await waitFor(() =>
      expect(body.getByRole("button", { name: "Use image" })).toBeDisabled()
    )
    await expect(args.onError).toHaveBeenCalledOnce()
    await expect(args.onConfirm).not.toHaveBeenCalled()
  },
})
