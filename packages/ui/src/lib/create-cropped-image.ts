export type ImageCropArea = {
  x: number
  y: number
  width: number
  height: number
}

export type CroppedImageOutputType = "image/jpeg" | "image/png" | "image/webp"

export type CreateCroppedImageOptions = {
  outputQuality?: number
  outputSize?: number
  outputType?: CroppedImageOutputType
}

export type CroppedImageResult = {
  blob: Blob
  crop: ImageCropArea
  height: number
  width: number
}

const DEFAULT_OUTPUT_SIZE = 512
const MAX_OUTPUT_SIZE = 8192

const isFiniteNumber = (value: number) => Number.isFinite(value)

const validateCrop = (crop: ImageCropArea) => {
  if (
    !isFiniteNumber(crop.x) ||
    !isFiniteNumber(crop.y) ||
    !isFiniteNumber(crop.width) ||
    !isFiniteNumber(crop.height) ||
    crop.width <= 0 ||
    crop.height <= 0
  ) {
    throw new TypeError(
      "Crop coordinates must be finite and have a positive size"
    )
  }
}

const validateOptions = ({
  outputQuality,
  outputSize = DEFAULT_OUTPUT_SIZE,
}: CreateCroppedImageOptions) => {
  if (
    !Number.isInteger(outputSize) ||
    outputSize < 1 ||
    outputSize > MAX_OUTPUT_SIZE
  ) {
    throw new RangeError(
      `Output size must be an integer between 1 and ${MAX_OUTPUT_SIZE}`
    )
  }

  if (
    outputQuality !== undefined &&
    (!isFiniteNumber(outputQuality) || outputQuality < 0 || outputQuality > 1)
  ) {
    throw new RangeError("Output quality must be between 0 and 1")
  }

  return outputSize
}

const loadImage = (sourceUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = "async"
    image.addEventListener("load", () => resolve(image), { once: true })
    image.addEventListener(
      "error",
      () => reject(new Error("The selected image could not be decoded")),
      { once: true }
    )
    image.src = sourceUrl
  })

const getBoundedCrop = (
  crop: ImageCropArea,
  sourceWidth: number,
  sourceHeight: number
): ImageCropArea => {
  const left = Math.max(0, crop.x)
  const top = Math.max(0, crop.y)
  const right = Math.min(sourceWidth, crop.x + crop.width)
  const bottom = Math.min(sourceHeight, crop.y + crop.height)

  if (right <= left || bottom <= top) {
    throw new RangeError("Crop area is outside the source image")
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

const exportCanvas = (
  canvas: HTMLCanvasElement,
  outputType: CroppedImageOutputType,
  outputQuality?: number
) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
          return
        }

        reject(new Error("The cropped image could not be encoded"))
      },
      outputType,
      outputQuality
    )
  })

async function createCroppedImage(
  source: Blob,
  crop: ImageCropArea,
  options: CreateCroppedImageOptions = {}
): Promise<CroppedImageResult> {
  validateCrop(crop)
  const outputSize = validateOptions(options)
  const outputType = options.outputType ?? "image/png"
  const sourceUrl = URL.createObjectURL(source)

  try {
    const image = await loadImage(sourceUrl)
    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height

    if (
      !isFiniteNumber(sourceWidth) ||
      !isFiniteNumber(sourceHeight) ||
      sourceWidth <= 0 ||
      sourceHeight <= 0
    ) {
      throw new Error("The selected image has invalid dimensions")
    }

    const boundedCrop = getBoundedCrop(crop, sourceWidth, sourceHeight)
    const outputHeight = Math.max(
      1,
      Math.round(outputSize * (boundedCrop.height / boundedCrop.width))
    )
    if (!Number.isSafeInteger(outputHeight) || outputHeight > MAX_OUTPUT_SIZE) {
      throw new RangeError(
        `Output height must be an integer between 1 and ${MAX_OUTPUT_SIZE}`
      )
    }
    const canvas = document.createElement("canvas")
    canvas.width = outputSize
    canvas.height = outputHeight

    const context = canvas.getContext("2d")
    if (!context) {
      throw new Error("Canvas image processing is unavailable")
    }

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = "high"
    context.drawImage(
      image,
      boundedCrop.x,
      boundedCrop.y,
      boundedCrop.width,
      boundedCrop.height,
      0,
      0,
      outputSize,
      outputHeight
    )

    const blob = await exportCanvas(canvas, outputType, options.outputQuality)

    return {
      blob,
      crop: boundedCrop,
      height: outputHeight,
      width: outputSize,
    }
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}

export { createCroppedImage }
