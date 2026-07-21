"use client"

import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Cropper from "react-easy-crop"

import type { ImageCropArea } from "../lib/create-cropped-image"

type ImageCropShape = "circle" | "rounded"

type ImageCropPoint = {
  x: number
  y: number
}

type ImageCropperProps = {
  ariaDescribedBy?: string
  ariaLabel?: string
  aspect?: number
  className?: string
  crop: ImageCropPoint
  disabled?: boolean
  maxZoom?: number
  minZoom?: number
  onCropChange: (crop: ImageCropPoint) => void
  onCropComplete: (crop: ImageCropArea) => void
  onSourceError?: (error: Error) => void
  onZoomChange: (zoom: number) => void
  shape?: ImageCropShape
  showGrid?: boolean
  source: Blob
  zoom: number
}

type SourceUrlState = {
  source: Blob
  url: string
}

type SourceStatusState = {
  source: Blob
  status: "error" | "loading" | "ready"
}

function ImageCropper({
  ariaDescribedBy,
  ariaLabel = "Image crop area",
  aspect = 1,
  className,
  crop,
  disabled = false,
  maxZoom = 3,
  minZoom = 1,
  onCropChange,
  onCropComplete,
  onSourceError,
  onZoomChange,
  shape = "rounded",
  showGrid = true,
  source,
  zoom,
}: ImageCropperProps) {
  const [sourceUrlState, setSourceUrlState] = useState<SourceUrlState | null>(
    null
  )
  const [sourceStatusState, setSourceStatusState] = useState<SourceStatusState>(
    { source, status: "loading" }
  )
  const sourceStatusRef = useRef<SourceStatusState>({
    source,
    status: "loading",
  })

  useEffect(() => {
    const loadingState: SourceStatusState = { source, status: "loading" }
    sourceStatusRef.current = loadingState
    setSourceStatusState(loadingState)
    const url = URL.createObjectURL(source)
    setSourceUrlState({ source, url })

    return () => URL.revokeObjectURL(url)
  }, [source])

  const sourceUrl =
    sourceUrlState?.source === source ? sourceUrlState.url : null
  const sourceStatus =
    sourceStatusState.source === source ? sourceStatusState.status : "loading"
  const containerStyle = useMemo(() => ({ aspectRatio: aspect }), [aspect])
  const cropperClasses = useMemo(
    () => ({
      containerClassName: disabled ? "pointer-events-none" : undefined,
      cropAreaClassName: shape === "rounded" ? "!rounded-[22%]" : undefined,
    }),
    [disabled, shape]
  )
  const cropperProps = useMemo(
    () => ({
      "aria-describedby": ariaDescribedBy,
      "aria-disabled": disabled || undefined,
      "aria-label": ariaLabel,
      role: "group",
      tabIndex: disabled ? -1 : 0,
    }),
    [ariaDescribedBy, ariaLabel, disabled]
  )
  const handleMediaLoaded = useCallback(() => {
    if (
      sourceStatusRef.current.source !== source ||
      sourceStatusRef.current.status !== "loading"
    ) {
      return
    }

    const readyState: SourceStatusState = { source, status: "ready" }
    sourceStatusRef.current = readyState
    setSourceStatusState(readyState)
  }, [source])
  const handleMediaError = useCallback(() => {
    if (
      sourceStatusRef.current.source !== source ||
      sourceStatusRef.current.status !== "loading"
    ) {
      return
    }

    const errorState: SourceStatusState = { source, status: "error" }
    sourceStatusRef.current = errorState
    setSourceStatusState(errorState)
    onSourceError?.(
      new Error("The selected image could not be decoded by the browser")
    )
  }, [onSourceError, source])
  const mediaProps = useMemo(
    () => ({ onError: handleMediaError }),
    [handleMediaError]
  )

  const handleCropChange = useCallback(
    (nextCrop: ImageCropPoint) => {
      if (!disabled) onCropChange(nextCrop)
    },
    [disabled, onCropChange]
  )
  const handleZoomChange = useCallback(
    (nextZoom: number) => {
      if (!disabled) onZoomChange(nextZoom)
    },
    [disabled, onZoomChange]
  )
  const handleCropComplete = useCallback(
    (_cropPercentages: ImageCropArea, cropPixels: ImageCropArea) => {
      if (
        !disabled &&
        sourceStatusRef.current.source === source &&
        sourceStatusRef.current.status === "ready"
      ) {
        onCropComplete(cropPixels)
      }
    },
    [disabled, onCropComplete, source]
  )
  const handleInteractionRequest = useCallback(() => !disabled, [disabled])

  return (
    <div
      data-slot="image-cropper"
      data-shape={shape}
      data-source-status={sourceStatus}
      aria-busy={sourceStatus === "loading"}
      className={cn(
        "relative w-full overflow-hidden rounded-3xl bg-muted",
        disabled && "cursor-not-allowed opacity-60",
        className
      )}
      style={containerStyle}
    >
      {sourceUrl ? (
        <Cropper
          key={sourceUrl}
          image={sourceUrl}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          minZoom={minZoom}
          maxZoom={maxZoom}
          cropShape={shape === "circle" ? "round" : "rect"}
          showGrid={showGrid}
          roundCropAreaPixels
          disableAutomaticStylesInjection
          classes={cropperClasses}
          cropperProps={cropperProps}
          mediaProps={mediaProps}
          onCropChange={handleCropChange}
          onCropComplete={handleCropComplete}
          onMediaLoaded={handleMediaLoaded}
          onZoomChange={handleZoomChange}
          onTouchRequest={handleInteractionRequest}
          onWheelRequest={handleInteractionRequest}
        />
      ) : null}
    </div>
  )
}

export { ImageCropper }
export type { ImageCropPoint, ImageCropShape, ImageCropperProps }
