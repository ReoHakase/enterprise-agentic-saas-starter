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
  DownloadIcon,
  FileIcon,
  ImageIcon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import { useCallback, type MouseEvent } from "react"

import { LocalDate } from "@/components/local-date/local-date"
import { UserProfileImage } from "@/components/user-identity/user-identity"
import { clientEnv } from "@/lib/env"

import { formatFileSize } from "../../format"
import type { PendingFileUpload } from "../../hooks/use-files-controller"
import { AuthenticatedFileImage } from "../authenticated-file-image/authenticated-file-image"

const attachmentSizes = "(max-width: 640px) 100vw, 320px"

const UploadRow = ({
  upload,
  onCancel,
  onRetry,
}: {
  upload: PendingFileUpload
  onCancel: (id: string) => void
  onRetry: (id: string) => void
}) => {
  const cancel = useCallback(() => onCancel(upload.id), [onCancel, upload.id])
  const retry = useCallback(() => onRetry(upload.id), [onRetry, upload.id])

  return (
    <li className="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/20 p-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
        <UploadIcon aria-hidden="true" className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <p className="truncate text-sm font-medium">{upload.file.name}</p>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatFileSize(upload.file.size)}
          </span>
        </div>
        {upload.status === "failed" ? (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {upload.error}
          </p>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <progress
              className="h-1.5 min-w-0 flex-1 accent-primary"
              max={100}
              value={upload.progress}
              aria-label={`Uploading ${upload.file.name}`}
            />
            <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
              {Math.round(upload.progress)}%
            </span>
          </div>
        )}
      </div>
      {upload.status === "failed" ? (
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
          Retry
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Cancel upload for ${upload.file.name}`}
        onClick={cancel}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </li>
  )
}

const FileRow = ({
  file,
  organizationId,
  onRequestDelete,
  onRequestPreview,
  onSelectThumbnail,
  thumbnailGroupName,
  thumbnailEditing,
  thumbnailPending,
  thumbnailSelected,
}: {
  file: FileDto
  organizationId: string
  onRequestDelete: (file: FileDto, trigger: HTMLButtonElement) => void
  onRequestPreview: (file: FileDto, trigger: HTMLButtonElement) => void
  onSelectThumbnail: (fileId: string) => void
  thumbnailGroupName: string
  thumbnailEditing: boolean
  thumbnailPending: boolean
  thumbnailSelected: boolean
}) => {
  const requestDelete = useCallback(
    (event: MouseEvent<HTMLButtonElement>) =>
      onRequestDelete(file, event.currentTarget),
    [file, onRequestDelete]
  )
  const requestPreview = useCallback(
    (event: MouseEvent<HTMLButtonElement>) =>
      onRequestPreview(file, event.currentTarget),
    [file, onRequestPreview]
  )
  const selectThumbnail = useCallback(
    () => onSelectThumbnail(file.id),
    [file.id, onSelectThumbnail]
  )
  const canPreview = file.previewable || file.textPreviewable
  const downloadUrl = buildFileDownloadUrl(clientEnv.VITE_API_BASE_URL, {
    organizationId,
    fileId: file.id,
  })

  return (
    <li className="overflow-hidden rounded-xl border bg-card">
      {file.previewable ? (
        <button
          type="button"
          className="flex max-h-72 min-h-36 w-full items-center justify-center overflow-hidden border-b bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
          aria-label={`Preview image ${file.filename}`}
          onClick={requestPreview}
        >
          <AuthenticatedFileImage
            file={file}
            organizationId={organizationId}
            sizes={attachmentSizes}
            className="max-h-72 w-full object-contain"
            loading="lazy"
          />
        </button>
      ) : null}
      <div
        role="group"
        aria-label={`File details for ${file.filename}`}
        className="flex min-h-16 min-w-0 items-center gap-3 p-3"
      >
        <div className="min-w-0 flex-1">
          {canPreview ? (
            <button
              type="button"
              data-slot="file-filename"
              className="flex max-w-full min-w-0 items-center gap-1.5 text-left text-sm font-medium hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              title={file.filename}
              onClick={requestPreview}
            >
              {file.previewable ? (
                <ImageIcon
                  data-slot="file-icon"
                  data-testid={`file-icon-${file.id}`}
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              ) : (
                <FileIcon
                  data-slot="file-icon"
                  data-testid={`file-icon-${file.id}`}
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              )}
              <span className="truncate">{file.filename}</span>
            </button>
          ) : (
            <p
              data-slot="file-filename"
              className="flex min-w-0 items-center gap-1.5 text-sm font-medium"
              title={file.filename}
            >
              <FileIcon
                data-slot="file-icon"
                data-testid={`file-icon-${file.id}`}
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="truncate">{file.filename}</span>
            </p>
          )}
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{formatFileSize(file.sizeBytes)}</span>
            <span aria-hidden="true">·</span>
            <span
              data-slot="file-uploader"
              className="flex min-w-0 items-center gap-1.5"
              aria-label={`Uploaded by ${file.uploader.name}`}
            >
              <UserProfileImage user={file.uploader} className="size-5" />
              <span className="truncate">{file.uploader.name}</span>
            </span>
            <span aria-hidden="true">·</span>
            <LocalDate value={file.createdAt} includeTime />
          </div>
        </div>
        {thumbnailEditing ? (
          <input
            type="radio"
            name={thumbnailGroupName}
            value={file.id}
            checked={thumbnailSelected}
            disabled={!file.previewable || thumbnailPending}
            aria-label={`Use ${file.filename} as thumbnail`}
            className="size-4 shrink-0 accent-primary"
            onChange={selectThumbnail}
          />
        ) : null}
        <a
          href={downloadUrl}
          download
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          aria-label={`Download ${file.filename}`}
        >
          <DownloadIcon aria-hidden="true" />
        </a>
        {file.canDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${file.filename}`}
            onClick={requestDelete}
          >
            <Trash2Icon aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </li>
  )
}

export { FileRow as fileRow, UploadRow as uploadRow }
