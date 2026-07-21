"use client"

import {
  buildFileDownloadUrl,
  type FileDto,
} from "@enterprise-agentic-saas/api/client"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@enterprise-agentic-saas/ui/components/alert-dialog"
import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import {
  Button,
  buttonVariants,
} from "@enterprise-agentic-saas/ui/components/button"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import {
  DownloadIcon,
  FileIcon,
  ImageIcon,
  PaperclipIcon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from "react"
import { toast } from "sonner"

import { LocalDate } from "@/components/local-date"
import { UserAvatar } from "@/components/user-identity"
import { showConsoleApiErrorToast } from "@/features/console/error-toast"
import { deleteFile, type FileOwnerType } from "@/features/files/api"
import { formatFileSize } from "@/features/files/format"
import { fileKeys, filesQueryOptions } from "@/features/files/queries"
import {
  useFileUploads,
  type PendingFileUpload,
} from "@/features/files/use-file-uploads"
import { apiClient } from "@/lib/api-client"
import { clientEnv } from "@/lib/env.client"

import { AuthenticatedFileImage } from "./authenticated-file-image"
import { FilePreviewDialog } from "./file-preview-dialog"

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
}: {
  file: FileDto
  organizationId: string
  onRequestDelete: (file: FileDto) => void
  onRequestPreview: (file: FileDto, trigger: HTMLButtonElement) => void
}) => {
  const requestDelete = useCallback(
    () => onRequestDelete(file),
    [file, onRequestDelete]
  )
  const requestPreview = useCallback(
    (event: MouseEvent<HTMLButtonElement>) =>
      onRequestPreview(file, event.currentTarget),
    [file, onRequestPreview]
  )
  const canPreview = file.previewable || file.textPreviewable
  const downloadUrl = buildFileDownloadUrl(clientEnv.NEXT_PUBLIC_API_BASE_URL, {
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
              <UserAvatar user={file.uploader} className="size-5" />
              <span className="truncate">{file.uploader.name}</span>
            </span>
            <span aria-hidden="true">·</span>
            <LocalDate value={file.createdAt} includeTime />
          </div>
        </div>
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

export const FileAttachments = ({
  organizationId,
  ownerType,
  ownerId,
  onFilesChanged,
}: {
  organizationId: string
  ownerType: FileOwnerType
  ownerId: string
  onFilesChanged?: () => void | Promise<void>
}) => {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const previewTriggerRef = useRef<HTMLElement | null>(null)
  const [fileToDelete, setFileToDelete] = useState<FileDto | null>(null)
  const [previewFileId, setPreviewFileId] = useState<string | null>(null)
  const filesQuery = useInfiniteQuery(
    filesQueryOptions(apiClient, organizationId, ownerType, ownerId)
  )
  const ownerQueryKey = useMemo(
    () => fileKeys.owner(organizationId, ownerType, ownerId),
    [organizationId, ownerId, ownerType]
  )
  useEffect(
    () => () => {
      queueMicrotask(() => {
        queryClient.removeQueries({
          queryKey: ownerQueryKey,
          exact: true,
          type: "inactive",
        })
      })
    },
    [ownerQueryKey, queryClient]
  )
  const notifyFilesChanged = useCallback(async () => {
    try {
      await onFilesChanged?.()
    } catch {
      // The file mutation remains authoritative when a parent timeline refresh
      // fails. Its normal query retry path can reconcile the stale timeline.
    }
  }, [onFilesChanged])
  const handleUploaded = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ownerQueryKey })
    await notifyFilesChanged()
    toast.success("File uploaded")
  }, [notifyFilesChanged, ownerQueryKey, queryClient])
  const handleCanceled = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ownerQueryKey })
    await notifyFilesChanged()
  }, [notifyFilesChanged, ownerQueryKey, queryClient])
  const { uploads, addFiles, retryUpload, cancelUpload } = useFileUploads({
    organizationId,
    ownerType,
    ownerId,
    onUploaded: handleUploaded,
    onCanceled: handleCanceled,
  })
  const deleteMutation = useMutation({
    mutationFn: (file: FileDto) =>
      deleteFile(apiClient, { organizationId, fileId: file.id }),
    onSuccess: async () => {
      setFileToDelete(null)
      await queryClient.invalidateQueries({ queryKey: ownerQueryKey })
      await notifyFilesChanged()
      toast.success("File deleted")
    },
    onError: (error) => {
      showConsoleApiErrorToast(error, "File deletion failed")
    },
  })
  const { mutate: mutateDelete, isPending: deletePending } = deleteMutation
  const { refetch, fetchNextPage } = filesQuery
  const files = useMemo(
    () => filesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [filesQuery.data]
  )
  const previewableFiles = useMemo(
    () => files.filter((file) => file.previewable || file.textPreviewable),
    [files]
  )
  const openPicker = useCallback(() => inputRef.current?.click(), [])
  const selectFiles = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.currentTarget.files) addFiles(event.currentTarget.files)
      event.currentTarget.value = ""
    },
    [addFiles]
  )
  const requestDelete = useCallback((file: FileDto) => {
    setFileToDelete(file)
  }, [])
  const requestPreview = useCallback(
    (file: FileDto, trigger: HTMLButtonElement) => {
      previewTriggerRef.current = trigger
      setPreviewFileId(file.id)
    },
    []
  )
  const selectPreviewFile = useCallback((fileId: string) => {
    setPreviewFileId(fileId)
  }, [])
  const closePreview = useCallback(() => {
    setPreviewFileId(null)
  }, [])
  const confirmDelete = useCallback(() => {
    if (fileToDelete) mutateDelete(fileToDelete)
  }, [fileToDelete, mutateDelete])
  const handleDeleteOpenChange = useCallback((open: boolean) => {
    if (!open) setFileToDelete(null)
  }, [])
  const retryList = useCallback(() => {
    void refetch()
  }, [refetch])
  const loadMore = useCallback(() => {
    void fetchNextPage()
  }, [fetchNextPage])

  return (
    <section
      data-slot="issue-attachments"
      className="flex min-w-0 flex-col gap-4"
      aria-labelledby="attachments-heading"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <PaperclipIcon aria-hidden="true" className="size-4" />
            <h3 id="attachments-heading" className="font-medium">
              Attachments
            </h3>
            {files.length > 0 ? (
              <Badge variant="secondary">{files.length}</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Files are private to members of this organization.
          </p>
        </div>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          multiple
          aria-label="Choose files to upload"
          onChange={selectFiles}
        />
        <Button type="button" variant="outline" size="sm" onClick={openPicker}>
          <UploadIcon data-icon="inline-start" aria-hidden="true" />
          Add files
        </Button>
      </div>

      {uploads.length > 0 ? (
        <ul aria-label="File uploads" className="flex flex-col gap-2">
          {uploads.map((upload) => (
            <UploadRow
              key={upload.id}
              upload={upload}
              onCancel={cancelUpload}
              onRetry={retryUpload}
            />
          ))}
        </ul>
      ) : null}

      {filesQuery.isPending ? (
        <div
          role="status"
          aria-label="Loading attachments"
          className="flex min-h-24 items-center justify-center rounded-xl border border-dashed"
        >
          <Spinner />
        </div>
      ) : filesQuery.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <p className="text-sm">Attachments could not be loaded.</p>
          <Button type="button" variant="outline" size="sm" onClick={retryList}>
            <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
            Try again
          </Button>
        </div>
      ) : files.length > 0 ? (
        <ul
          aria-label="Attachments"
          className="grid min-w-0 gap-3 xl:grid-cols-2"
        >
          {files.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              organizationId={organizationId}
              onRequestDelete={requestDelete}
              onRequestPreview={requestPreview}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          No files attached yet.
        </p>
      )}

      {filesQuery.hasNextPage ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={filesQuery.isFetchingNextPage}
          onClick={loadMore}
        >
          {filesQuery.isFetchingNextPage ? <Spinner /> : null}
          Load more files
        </Button>
      ) : null}

      <FilePreviewDialog
        organizationId={organizationId}
        files={previewableFiles}
        selectedFileId={previewFileId}
        finalFocusRef={previewTriggerRef}
        onSelectFile={selectPreviewFile}
        onClose={closePreview}
      />

      <AlertDialog
        open={fileToDelete !== null}
        onOpenChange={handleDeleteOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the file for every organization member.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletePending}
              onClick={confirmDelete}
            >
              {deletePending ? <Spinner /> : <Trash2Icon />}
              Delete file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
