"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@enterprise-agentic-saas/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@enterprise-agentic-saas/ui/components/field"
import {
  ImageCropper,
  type ImageCropPoint,
  type ImageCropShape,
} from "@enterprise-agentic-saas/ui/components/image-cropper"
import { Slider } from "@enterprise-agentic-saas/ui/components/slider"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import {
  createCroppedImage,
  type CroppedImageOutputType,
  type CroppedImageResult,
  type ImageCropArea,
} from "@enterprise-agentic-saas/ui/lib/create-cropped-image"
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useState,
} from "react"

type ImageCropDialogProps = {
  aspect?: number
  cancelLabel?: ReactNode
  confirmLabel?: ReactNode
  description?: ReactNode
  errorMessage?: ReactNode
  maxZoom?: number
  minZoom?: number
  onConfirm: (result: CroppedImageResult) => Promise<void> | void
  onError?: (error: unknown) => void
  onOpenChange: (open: boolean) => void
  open: boolean
  outputQuality?: number
  outputSize?: number
  outputType?: CroppedImageOutputType
  shape?: ImageCropShape
  source: Blob
  title?: ReactNode
}

const INITIAL_CROP: ImageCropPoint = { x: 0, y: 0 }
const getZoomAriaLabel = () => "Zoom"

function ImageCropDialog({
  aspect = 1,
  cancelLabel = "Cancel",
  confirmLabel = "Use image",
  description = "Move and zoom the image to choose the visible area.",
  errorMessage,
  maxZoom = 3,
  minZoom = 1,
  onConfirm,
  onError,
  onOpenChange,
  open,
  outputQuality,
  outputSize = 512,
  outputType = "image/png",
  shape = "rounded",
  source,
  title = "Crop image",
}: ImageCropDialogProps) {
  const sliderId = useId()
  const cropDescriptionId = useId()
  const [crop, setCrop] = useState<ImageCropPoint>(INITIAL_CROP)
  const [cropArea, setCropArea] = useState<ImageCropArea | null>(null)
  const [zoom, setZoom] = useState(minZoom)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingError, setProcessingError] = useState<ReactNode>(null)

  useEffect(() => {
    if (!open) return

    setCrop(INITIAL_CROP)
    setCropArea(null)
    setZoom(minZoom)
    setProcessingError(null)
  }, [minZoom, open, source])

  const visibleError =
    errorMessage === undefined ? processingError : errorMessage

  const handleZoomChange = useCallback(
    (nextValue: number | readonly number[]) => {
      const nextZoom = Array.isArray(nextValue) ? nextValue[0] : nextValue
      setZoom(nextZoom ?? minZoom)
    },
    [minZoom]
  )
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!isProcessing) onOpenChange(nextOpen)
    },
    [isProcessing, onOpenChange]
  )
  const handleCancel = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])
  const handleSourceError = useCallback(
    (error: Error) => {
      setCropArea(null)
      setProcessingError(
        "The image could not be loaded. Choose a different image."
      )
      onError?.(error)
    },
    [onError]
  )
  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!cropArea || isProcessing) return

      setIsProcessing(true)
      setProcessingError(null)

      try {
        const result = await createCroppedImage(source, cropArea, {
          outputQuality,
          outputSize,
          outputType,
        })
        await onConfirm(result)
        onOpenChange(false)
      } catch (error) {
        setProcessingError("The image could not be processed. Try again.")
        onError?.(error)
      } finally {
        setIsProcessing(false)
      }
    },
    [
      cropArea,
      isProcessing,
      onConfirm,
      onError,
      onOpenChange,
      outputQuality,
      outputSize,
      outputType,
      source,
    ]
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        motion="fade"
        showCloseButton={!isProcessing}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-6"
          aria-busy={isProcessing}
          onSubmit={handleSubmit}
        >
          <FieldGroup className="gap-5">
            <ImageCropper
              source={source}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              minZoom={minZoom}
              maxZoom={maxZoom}
              shape={shape}
              disabled={isProcessing}
              ariaDescribedBy={cropDescriptionId}
              onCropChange={setCrop}
              onCropComplete={setCropArea}
              onSourceError={handleSourceError}
              onZoomChange={setZoom}
            />

            <Field data-disabled={isProcessing || undefined}>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor={sliderId}>Zoom</FieldLabel>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {Math.round(zoom * 100)}%
                </span>
              </div>
              <Slider
                id={sliderId}
                value={zoom}
                min={minZoom}
                max={maxZoom}
                step={0.01}
                disabled={isProcessing}
                getAriaLabel={getZoomAriaLabel}
                onValueChange={handleZoomChange}
              />
              <FieldDescription id={cropDescriptionId}>
                Drag the image, or focus the crop area and use the arrow keys to
                adjust its position.
              </FieldDescription>
            </Field>

            {visibleError ? (
              <Field data-invalid>
                <FieldError>{visibleError}</FieldError>
              </Field>
            ) : null}
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isProcessing}
              onClick={handleCancel}
            >
              {cancelLabel}
            </Button>
            <Button type="submit" disabled={isProcessing || !cropArea}>
              {isProcessing ? (
                <Spinner
                  data-icon="inline-start"
                  aria-label="Processing image"
                />
              ) : null}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { ImageCropDialog }
export type { ImageCropDialogProps }
