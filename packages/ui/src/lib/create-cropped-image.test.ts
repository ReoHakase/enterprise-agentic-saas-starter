import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createCroppedImage } from "./create-cropped-image"

const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(
  URL,
  "createObjectURL"
)
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(
  URL,
  "revokeObjectURL"
)

class TestImage {
  decoding = "auto"
  height = 800
  naturalHeight = 800
  naturalWidth = 1000
  width = 1000
  protected listeners = new Map<string, EventListener>()

  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, listener)
  }

  set src(_value: string) {
    queueMicrotask(() => this.listeners.get("load")?.(new Event("load")))
  }
}

class FailingTestImage extends TestImage {
  override set src(_value: string) {
    queueMicrotask(() => this.listeners.get("error")?.(new Event("error")))
  }
}

type DrawImageMock = (
  image: CanvasImageSource,
  first: number,
  second: number,
  third?: number,
  fourth?: number,
  fifth?: number,
  sixth?: number,
  seventh?: number,
  eighth?: number
) => void

describe("createCroppedImageの契約", () => {
  const createObjectUrl = vi.fn<(source: Blob) => string>(
    () => "blob:test-source"
  )
  const revokeObjectUrl = vi.fn<(url: string) => void>()
  const drawImage = vi.fn<DrawImageMock>()

  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    })
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    })
    vi.stubGlobal("Image", TestImage)
    const context: CanvasRenderingContext2D = Object.create(null)
    context.drawImage = drawImage
    context.imageSmoothingEnabled = false
    context.imageSmoothingQuality = "low"
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context)
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback, type) => {
        callback(new Blob(["cropped"], { type: type ?? "image/png" }))
      }
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    createObjectUrl.mockClear()
    revokeObjectUrl.mockClear()
    drawImage.mockClear()

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

  it("ソースをトリミングし、選択したアスペクト比を維持する", async () => {
    const source = new Blob(["source"], { type: "image/png" })

    const result = await createCroppedImage(
      source,
      { x: 100, y: 50, width: 400, height: 200 },
      { outputQuality: 0.9, outputSize: 512, outputType: "image/png" }
    )

    expect(result).toMatchObject({
      crop: { x: 100, y: 50, width: 400, height: 200 },
      height: 256,
      width: 512,
    })
    expect(result.blob.type).toBe("image/png")
    expect(drawImage).toHaveBeenCalledWith(
      expect.any(TestImage),
      100,
      50,
      400,
      200,
      0,
      0,
      512,
      256
    )
    expect(createObjectUrl).toHaveBeenCalledWith(source)
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:test-source")
  })

  it("デコード前に無効なcrop寸法を拒否する", async () => {
    const source = new Blob(["source"], { type: "image/png" })

    await expect(
      createCroppedImage(source, { x: 0, y: 0, width: 0, height: 10 })
    ).rejects.toThrow("positive size")
    expect(createObjectUrl).not.toHaveBeenCalled()
  })

  it("デコード前に範囲外の出力品質を拒否する", async () => {
    const source = new Blob(["source"], { type: "image/png" })

    await expect(
      createCroppedImage(
        source,
        { x: 0, y: 0, width: 10, height: 10 },
        { outputQuality: 2 }
      )
    ).rejects.toThrow("between 0 and 1")
    expect(createObjectUrl).not.toHaveBeenCalled()
  })

  it("エンコード失敗時にソースURLを取り消す", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(null)
    )

    await expect(
      createCroppedImage(new Blob(["source"], { type: "image/png" }), {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      })
    ).rejects.toThrow("could not be encoded")
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:test-source")
  })

  it("ブラウザーのデコード失敗時にソースURLを取り消す", async () => {
    vi.stubGlobal("Image", FailingTestImage)

    await expect(
      createCroppedImage(new Blob(["invalid"], { type: "image/png" }), {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      })
    ).rejects.toThrow("could not be decoded")

    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:test-source")
    expect(drawImage).not.toHaveBeenCalled()
  })

  it("安全なキャンバスの制限を超える出力サイズを拒否する", async () => {
    await expect(
      createCroppedImage(
        new Blob(["source"], { type: "image/png" }),
        { x: 0, y: 0, width: 1, height: 800 },
        { outputSize: 512 }
      )
    ).rejects.toThrow("Output height")

    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:test-source")
    expect(drawImage).not.toHaveBeenCalled()
  })
})
