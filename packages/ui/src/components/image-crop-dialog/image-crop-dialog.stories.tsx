import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import {
  invalidImageCropSource,
  validImageCropSource,
} from "../../test-support/image-crop-story-fixture"
import { ImageCropDialog } from "./image-crop-dialog"

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
    source: validImageCropSource,
  },
  argTypes: {
    source: { control: false },
  },
})

export const Circular = meta.story({
  args: { shape: "circle" },
  play: async ({ args, canvasElement, step }) => {
    await step("zoomを調整してcrop結果を確定する", async () => {
      const body = within(canvasElement.ownerDocument.body)
      const dialog = await body.findByRole("dialog", { name: "Crop image" })
      await waitFor(() => expect(dialog).toBeVisible())
      const slider = body.getByRole("slider", { name: "Zoom" })
      await expect(slider).toBeEnabled()

      const confirm = body.getByRole("button", { name: "Use image" })
      await waitFor(() => expect(confirm).toBeEnabled())
      slider.focus()
      await userEvent.keyboard("{ArrowRight}")
      await userEvent.click(confirm)
      await waitFor(() => expect(args.onConfirm).toHaveBeenCalledOnce())

      const result = args.onConfirm.mock.calls[0]?.[0]
      await expect(result).toMatchObject({ height: 512, width: 512 })
      await expect(args.onError).not.toHaveBeenCalled()
    })
  },
})

export const RoundedSquare = meta.story({
  args: { shape: "rounded" },
})

export const DecodeError = meta.story({
  args: { source: invalidImageCropSource },
})
