import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useCallback } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ImageCropArea } from "../../lib/create-cropped-image"
import { ImageCropper, type ImageCropPoint } from "./image-cropper"

type CropperMockProps = {
  cropperProps: React.ComponentProps<"div">
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
  cropperProps,
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
      <div data-testid="cropper-area" {...cropperProps} />
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

describe("ImageCropperの契約", () => {
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

  it("ソース変更時に古いオブジェクトURLを取り消す", async () => {
    const firstSource = new Blob(["first"], { type: "image/png" })
    const secondSource = new Blob(["second"], { type: "image/png" })
    createObjectUrl
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second")

    const { rerender } = render(
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
    expect(createObjectUrl).toHaveBeenNthCalledWith(1, firstSource)
    expect(createObjectUrl).toHaveBeenNthCalledWith(2, secondSource)
  })

  it("アンマウント時に現在のオブジェクトURLを取り消す", async () => {
    const source = new Blob(["source"], { type: "image/png" })
    createObjectUrl.mockReturnValue("blob:source")

    const { unmount } = render(
      <ImageCropper
        source={source}
        crop={crop}
        zoom={1}
        onCropChange={onCropChange}
        onCropComplete={onCropComplete}
        onZoomChange={onZoomChange}
      />
    )

    expect(await screen.findByTestId("cropper-source")).toHaveTextContent(
      "blob:source"
    )
    unmount()

    expect(createObjectUrl).toHaveBeenCalledWith(source)
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:source")
  })

  it("クロップ領域をキーボード操作可能な説明付き領域として公開する", async () => {
    const user = userEvent.setup()
    createObjectUrl.mockReturnValue("blob:source")

    render(
      <ImageCropper
        ariaDescribedBy="crop-instructions"
        source={new Blob(["source"], { type: "image/png" })}
        crop={crop}
        zoom={1}
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
  })

  it("無効になっている間はクロップコールバックをブロックする", async () => {
    const user = userEvent.setup()
    createObjectUrl.mockReturnValue("blob:source")

    render(
      <ImageCropper
        source={new Blob(["source"], { type: "image/png" })}
        crop={crop}
        zoom={1}
        disabled
        onCropChange={onCropChange}
        onCropComplete={onCropComplete}
        onZoomChange={onZoomChange}
      />
    )

    const cropArea = await screen.findByTestId("cropper-area")
    expect(cropArea).toHaveAttribute("aria-disabled", "true")
    expect(cropArea).toHaveAttribute("tabindex", "-1")
    await user.click(
      screen.getByRole("button", { name: "Simulate interaction" })
    )
    expect(onCropChange).not.toHaveBeenCalled()
    expect(onCropComplete).not.toHaveBeenCalled()
    expect(onZoomChange).not.toHaveBeenCalled()
  })

  it("ソースのデコード失敗を報告する", async () => {
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
    expect(onSourceError.mock.calls[0]?.[0]).toBeInstanceOf(Error)
  })

  it("ソースのデコードに失敗した後は、古いクロップの完了を無視する", async () => {
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
