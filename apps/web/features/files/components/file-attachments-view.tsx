"use client"

import type { FileDto } from "@enterprise-agentic-saas/api/client"
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
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import {
  ImageIcon,
  PaperclipIcon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { type ChangeEvent, type RefObject } from "react"

import type { FileOwnerType } from "../api"
import type { PendingFileUpload } from "../hooks/use-files-controller"
import {
  fileRow as FileRow,
  uploadRow as UploadRow,
} from "./file-attachment-rows"
import { FilePreviewDialog } from "./file-preview-dialog"

type FileAttachmentsViewProps = {
  organizationId: string
  ownerType: FileOwnerType
  files: FileDto[]
  uploads: PendingFileUpload[]
  inputRef: RefObject<HTMLInputElement | null>
  selectFiles: (event: ChangeEvent<HTMLInputElement>) => void
  openPicker: () => void
  cancelUpload: (id: string) => void
  retryUpload: (id: string) => void
  thumbnailEditing: boolean
  thumbnailPending: boolean
  thumbnailQueryPending: boolean
  thumbnailQueryError: boolean
  closeThumbnailEditor: () => void
  thumbnailChanged: boolean
  confirmThumbnail: () => void
  openThumbnailEditor: () => void
  filesPending: boolean
  filesError: boolean
  retryList: () => void
  requestDelete: (file: FileDto) => void
  requestPreview: (file: FileDto, trigger: HTMLButtonElement) => void
  selectThumbnail: (fileId: string) => void
  thumbnailGroupName: string
  thumbnailDraftFileId: string | null
  hasNextPage: boolean
  fetchingNextPage: boolean
  loadMore: () => void
  previewableFiles: FileDto[]
  previewFileId: string | null
  previewTriggerRef: RefObject<HTMLElement | null>
  selectPreviewFile: (fileId: string) => void
  closePreview: () => void
  fileToDelete: FileDto | null
  handleDeleteOpenChange: (open: boolean) => void
  deletePending: boolean
  confirmDelete: () => void
}

const FileAttachmentsView = ({
  organizationId,
  ownerType,
  files,
  uploads,
  inputRef,
  selectFiles,
  openPicker,
  cancelUpload,
  retryUpload,
  thumbnailEditing,
  thumbnailPending,
  thumbnailQueryPending,
  thumbnailQueryError,
  closeThumbnailEditor,
  thumbnailChanged,
  confirmThumbnail,
  openThumbnailEditor,
  filesPending,
  filesError,
  retryList,
  requestDelete,
  requestPreview,
  selectThumbnail,
  thumbnailGroupName,
  thumbnailDraftFileId,
  hasNextPage,
  fetchingNextPage,
  loadMore,
  previewableFiles,
  previewFileId,
  previewTriggerRef,
  selectPreviewFile,
  closePreview,
  fileToDelete,
  handleDeleteOpenChange,
  deletePending,
  confirmDelete,
}: FileAttachmentsViewProps) => (
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
      <div
        role="group"
        aria-label="Attachment actions"
        className="flex flex-wrap items-center gap-2"
      >
        <Button type="button" variant="outline" size="sm" onClick={openPicker}>
          <UploadIcon data-icon="inline-start" aria-hidden="true" />
          Add files
        </Button>
        {ownerType === "issue" && files.length > 0 ? (
          thumbnailEditing ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={thumbnailPending}
                onClick={closeThumbnailEditor}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!thumbnailChanged || thumbnailPending}
                onClick={confirmThumbnail}
              >
                Confirm
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                thumbnailQueryPending || thumbnailQueryError || thumbnailPending
              }
              onClick={openThumbnailEditor}
            >
              <ImageIcon
                data-icon="inline-start"
                data-testid="change-thumbnail-icon"
                aria-hidden="true"
              />
              Change thumbnail
            </Button>
          )
        ) : null}
      </div>
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

    {filesPending ? (
      <div
        role="status"
        aria-label="Loading attachments"
        className="flex min-h-24 items-center justify-center rounded-xl border border-dashed"
      >
        <Spinner />
      </div>
    ) : filesError ? (
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
            onSelectThumbnail={selectThumbnail}
            thumbnailGroupName={thumbnailGroupName}
            thumbnailEditing={thumbnailEditing}
            thumbnailPending={thumbnailPending}
            thumbnailSelected={thumbnailDraftFileId === file.id}
          />
        ))}
      </ul>
    ) : (
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        No files attached yet.
      </p>
    )}

    {hasNextPage ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={fetchingNextPage}
        onClick={loadMore}
      >
        {fetchingNextPage ? <Spinner /> : null}
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
          <AlertDialogCancel disabled={deletePending}>Cancel</AlertDialogCancel>
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

export { FileAttachmentsView as fileAttachmentsView }
