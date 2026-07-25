"use client"

import {
  buildFileDownloadUrl,
  type FileDto,
} from "@enterprise-agentic-saas/api/client"
import {
  Button,
  buttonVariants,
} from "@enterprise-agentic-saas/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@enterprise-agentic-saas/ui/components/dialog"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useQuery } from "@tanstack/react-query"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileTextIcon,
  ImageIcon,
  RefreshCwIcon,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  type CSSProperties,
  type RefObject,
} from "react"

import { LocalDate } from "@/components/local-date/local-date"
import { UserProfileImage } from "@/components/user-identity/user-identity"
import { apiClient } from "@/lib/api-client"
import { clientEnv } from "@/lib/env.client"

import { formatFileSize } from "../../format"
import { textFilePreviewQueryOptions } from "../../queries"
import { AuthenticatedFileImage } from "../authenticated-file-image/authenticated-file-image"

const fullscreenImageSizes = "100vw"
const fullViewportDialogStyle = {
  animation: "none",
  height: "100dvh",
  inset: 0,
  maxHeight: "none",
  maxWidth: "none",
  transform: "none",
  width: "100vw",
} satisfies CSSProperties

const TextFilePreview = ({
  organizationId,
  fileId,
}: {
  organizationId: string
  fileId: string
}) => {
  const previewQuery = useQuery(
    textFilePreviewQueryOptions(apiClient, organizationId, fileId)
  )
  const { refetch } = previewQuery
  const retry = useCallback(() => {
    void refetch()
  }, [refetch])

  if (previewQuery.isPending) {
    return (
      <div
        className="flex min-h-0 flex-1 items-center justify-center bg-muted/20"
        role="status"
        aria-label="Loading text preview"
      >
        <Spinner />
      </div>
    )
  }

  if (previewQuery.isError) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-muted/20 p-6 text-center"
        role="alert"
      >
        <p>Text preview could not be loaded.</p>
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/20">
      {previewQuery.data.truncated ? (
        <div
          role="status"
          className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
        >
          Preview limited to the first 1 MB. Download the original file to view
          the rest.
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <pre className="min-w-full font-mono text-sm leading-relaxed break-all whitespace-pre-wrap">
          {previewQuery.data.content}
        </pre>
      </div>
    </div>
  )
}

export const FilePreviewDialog = ({
  organizationId,
  files,
  selectedFileId,
  finalFocusRef,
  onSelectFile,
  onClose,
}: {
  organizationId: string
  files: FileDto[]
  selectedFileId: string | null
  finalFocusRef: RefObject<HTMLElement | null>
  onSelectFile: (fileId: string) => void
  onClose: () => void
}) => {
  const currentIndex = useMemo(
    () => files.findIndex((file) => file.id === selectedFileId),
    [files, selectedFileId]
  )
  const file = currentIndex >= 0 ? files[currentIndex] : undefined
  const hasPrevious = currentIndex > 0
  const hasNext = currentIndex >= 0 && currentIndex < files.length - 1

  const selectPrevious = useCallback(() => {
    const previousFile = files[currentIndex - 1]
    if (previousFile) onSelectFile(previousFile.id)
  }, [currentIndex, files, onSelectFile])
  const selectNext = useCallback(() => {
    const nextFile = files[currentIndex + 1]
    if (nextFile) onSelectFile(nextFile.id)
  }, [currentIndex, files, onSelectFile])
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) return
      const focusTarget = finalFocusRef.current
      onClose()
      setTimeout(() => {
        requestAnimationFrame(() => {
          if (focusTarget?.isConnected) {
            focusTarget.focus({ preventScroll: true })
          }
        })
      }, 0)
    },
    [finalFocusRef, onClose]
  )
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return
      }
      if (event.key === "ArrowLeft" && hasPrevious) {
        event.preventDefault()
        selectPrevious()
      }
      if (event.key === "ArrowRight" && hasNext) {
        event.preventDefault()
        selectNext()
      }
    },
    [hasNext, hasPrevious, selectNext, selectPrevious]
  )
  useEffect(() => {
    if (!file) return
    document.addEventListener("keydown", handleKeyDown, true)
    return () => document.removeEventListener("keydown", handleKeyDown, true)
  }, [file, handleKeyDown])

  const downloadUrl = file
    ? buildFileDownloadUrl(clientEnv.NEXT_PUBLIC_API_BASE_URL, {
        organizationId,
        fileId: file.id,
      })
    : ""

  return (
    <Dialog open={file !== undefined} onOpenChange={handleOpenChange}>
      <DialogContent
        className="inset-0 top-0 left-0 flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-background p-0 shadow-none ring-0 sm:max-w-none"
        finalFocus={finalFocusRef}
        style={fullViewportDialogStyle}
      >
        {file ? (
          <>
            <DialogHeader className="min-h-16 shrink-0 justify-center gap-1 border-b px-4 py-2 pr-14 sm:px-6 sm:pr-16">
              <div className="flex min-w-0 items-center gap-2">
                {file.previewable ? (
                  <ImageIcon
                    data-slot="file-preview-icon"
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                ) : (
                  <FileTextIcon
                    data-slot="file-preview-icon"
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                )}
                <DialogTitle
                  className="min-w-0 flex-1 truncate"
                  title={file.filename}
                >
                  {file.filename}
                </DialogTitle>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Preview previous file"
                    disabled={!hasPrevious}
                    onClick={selectPrevious}
                  >
                    <ChevronLeftIcon aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Preview next file"
                    disabled={!hasNext}
                    onClick={selectNext}
                  >
                    <ChevronRightIcon aria-hidden="true" />
                  </Button>
                  <a
                    href={downloadUrl}
                    download
                    className={buttonVariants({
                      variant: "ghost",
                      size: "icon-sm",
                    })}
                    aria-label={`Download ${file.filename}`}
                  >
                    <DownloadIcon aria-hidden="true" />
                  </a>
                </div>
              </div>
              <DialogDescription className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                <span>{formatFileSize(file.sizeBytes)}</span>
                <span aria-hidden="true">·</span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <UserProfileImage user={file.uploader} className="size-5" />
                  <span className="truncate">{file.uploader.name}</span>
                </span>
                <span aria-hidden="true">·</span>
                <LocalDate value={file.createdAt} includeTime />
              </DialogDescription>
            </DialogHeader>
            {file.previewable ? (
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black/90 p-2 sm:p-4">
                <AuthenticatedFileImage
                  file={file}
                  organizationId={organizationId}
                  sizes={fullscreenImageSizes}
                  className="size-full object-contain"
                />
              </div>
            ) : file.textPreviewable ? (
              <TextFilePreview
                key={file.id}
                organizationId={organizationId}
                fileId={file.id}
              />
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
