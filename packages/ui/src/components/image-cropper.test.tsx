import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useCallback } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ImageCropArea } from "../lib/create-cropped-image"
import { ImageCropper, type ImageCropPoint } from "./image-cropper"

type CropperMockProps = {
  classes: {
    containerClassName?: string
    cropAreaClassName?: string
  }
  cropperProps: React.ComponentProps<"div">
  cropShape: "rect" | "round"
  image: string
  mediaProps: { onError?: () => void }
  onCropChange: (crop: ImageCropPoint) => void
  onCropComplete: (
    cropPercentages: ImageCropArea,
    cropPixels: ImageCropArea
  ) => void
  onMediaLoaded: () => void
  onZoomChange: (zoom: number) => void
}

const NEXT_AREA = { height: 20, width: 20, x: 1, y: 2 }

function CropperMock({
  classes,
  cropperProps,
  cropShape,
  image,
  mediaProps,
  onCropChange,
  onCropComplete,
  onMediaLoaded,
  onZoomChange,
}: CropperMockProps) {
  const handleInteraction = useCallback(() => {
    onCropChange({ x: 1, y: 2 })
    onCropComplete(NEXT_AREA, NEXT_AREA)
    onZoomChange(2)
  }, [onCropChange, onCropComplete, onZoomChange])
  const handleSourceError = useCallback(
    () => mediaProps.onError?.(),
    [mediaProps]
  )

  return (
    <div>
      <span data-testid="cropper-source">{image}</span>
      <div
        data-testid="cropper-area"
        data-container-class={classes.containerClassName}
        data-crop-area-class={classes.cropAreaClassName}
        data-crop-shape={cropShape}
        {...cropperProps}
      />
      <button type="button" onClick={handleInteraction}>
        Simulate interaction
      </button>
      <button type="button" onClick={onMediaLoaded}>
        Simulate media loaded
      </button>
      <button type="button" onClick={handleSourceError}>
        Simulate source error
      </button>
    </div>
  )
}

vi.mock("react-easy-crop", () => ({ default: CropperMock }))

const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(
  URL,
  "createObjectURL"
)
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(
  URL,
  "revokeObjectURL"
)
const crop: ImageCropPoint = { x: 0, y: 0 }

describe("ImageCropper", () => {
  const createObjectUrl = vi.fn<(source: Blob) => string>()
  const revokeObjectUrl = vi.fn<(url: string) => void>()
  const onCropChange = vi.fn<(nextCrop: ImageCropPoint) => void>()
  const onCropComplete = vi.fn<() => void>()
  const onZoomChange = vi.fn<(zoom: number) => void>()

  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    })
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    createObjectUrl.mockReset()
    revokeObjectUrl.mockReset()
    onCropChange.mockReset()
    onCropComplete.mockReset()
    onZoomChange.mockReset()

    if (originalCreateObjectUrl) {
      Object.defineProperty(URL, "createObjectURL", originalCreateObjectUrl)
    } else {
      Reflect.deleteProperty(URL, "createObjectURL")
    }
    if (originalRevokeObjectUrl) {
      Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectUrl)
    } else {
      Reflect.deleteProperty(URL, "revokeObjectURL")
    }
  })

  it("replaces and revokes object URLs when the source changes or unmounts", async () => {
    const firstSource = new Blob(["first"], { type: "image/png" })
    const secondSource = new Blob(["second"], { type: "image/png" })
    createObjectUrl
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second")

    const { rerender, unmount } = render(
      <ImageCropper
        source={firstSource}
        crop={crop}
        zoom={1}
        onCropChange={onCropChange}
        onCropComplete={onCropComplete}
        onZoomChange={onZoomChange}
      />
    )

    expect(await screen.findByTestId("cropper-source")).toHaveTextContent(
      "blob:first"
    )
    rerender(
      <ImageCropper
        source={secondSource}
        crop={crop}
        zoom={1}
        onCropChange={onCropChange}
        onCropComplete={onCropComplete}
        onZoomChange={onZoomChange}
      />
    )

    expect(await screen.findByTestId("cropper-source")).toHaveTextContent(
      "blob:second"
    )
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:first")

    unmount()
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:second")
    expect(createObjectUrl).toHaveBeenNthCalledWith(1, firstSource)
    expect(createObjectUrl).toHaveBeenNthCalledWith(2, secondSource)
  })

  it("keeps rounded previews distinct and exposes keyboard instructions", async () => {
    const user = userEvent.setup()
    createObjectUrl.mockReturnValue("blob:source")

    render(
      <ImageCropper
        ariaDescribedBy="crop-instructions"
        source={new Blob(["source"], { type: "image/png" })}
        crop={crop}
        zoom={1}
        shape="rounded"
        onCropChange={onCropChange}
        onCropComplete={onCropComplete}
        onZoomChange={onZoomChange}
      />
    )

    const cropArea = await screen.findByTestId("cropper-area")
    await user.click(
      screen.getByRole("button", { name: "Simulate media loaded" })
    )
    expect(cropArea).toHaveAttribute("aria-describedby", "crop-instructions")
    expect(cropArea).toHaveAttribute("aria-label", "Image crop area")
    expect(cropArea).toHaveAttribute("tabindex", "0")
    expect(cropArea).toHaveAttribute("data-crop-shape", "rect")
    expect(cropArea).toHaveAttribute("data-crop-area-class", "!rounded-[22%]")
  })

  it("blocks crop callbacks while disabled and reports decode failures", async () => {
    const user = userEvent.setup()
    const onSourceError = vi.fn<(error: Error) => void>()
    createObjectUrl.mockReturnValue("blob:source")

    render(
      <ImageCropper
        source={new Blob(["source"], { type: "image/png" })}
        crop={crop}
        zoom={1}
        disabled
        onCropChange={onCropChange}
        onCropComplete={onCropComplete}
        onSourceError={onSourceError}
        onZoomChange={onZoomChange}
      />
    )

    const cropArea = await screen.findByTestId("cropper-area")
    expect(cropArea).toHaveAttribute("aria-disabled", "true")
    expect(cropArea).toHaveAttribute("tabindex", "-1")
    expect(cropArea).toHaveAttribute(
      "data-container-class",
      "pointer-events-none"
    )

    await user.click(
      screen.getByRole("button", { name: "Simulate interaction" })
    )
    expect(onCropChange).not.toHaveBeenCalled()
    expect(onCropComplete).not.toHaveBeenCalled()
    expect(onZoomChange).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole("button", { name: "Simulate source error" })
    )
    expect(onSourceError).toHaveBeenCalledOnce()
    expect(onSourceError.mock.calls[0]?.[0]).toBeInstanceOf(Error)
  })

  it("ignores stale crop completion after the source fails to decode", async () => {
    const user = userEvent.setup()
    const onSourceError = vi.fn<(error: Error) => void>()
    createObjectUrl.mockReturnValue("blob:source")

    render(
      <ImageCropper
        source={new Blob(["source"], { type: "image/png" })}
        crop={crop}
        zoom={1}
        onCropChange={onCropChange}
        onCropComplete={onCropComplete}
        onSourceError={onSourceError}
        onZoomChange={onZoomChange}
      />
    )

    await screen.findByTestId("cropper-area")
    await user.click(
      screen.getByRole("button", { name: "Simulate source error" })
    )
    expect(onSourceError).toHaveBeenCalledOnce()

    await user.click(
      screen.getByRole("button", { name: "Simulate media loaded" })
    )
    await user.click(
      screen.getByRole("button", { name: "Simulate interaction" })
    )
    expect(onCropComplete).not.toHaveBeenCalled()
  })
})
