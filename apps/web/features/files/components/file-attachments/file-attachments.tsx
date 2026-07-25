"use client"

import type { FileDto } from "@enterprise-agentic-saas/api/client"
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react"
import { toast } from "sonner"

import { showConsoleApiErrorToast } from "@/features/console"
import {
  updateIssueThumbnail,
  issueKeys,
  issueThumbnailQueryOptions,
} from "@/features/issues"
import { apiClient } from "@/lib/api-client"

import { deleteFile, type FileOwnerType } from "../../api"
import { useFilesController } from "../../hooks/use-files-controller"
import { fileKeys, filesQueryOptions } from "../../queries"
import { fileAttachmentsView as FileAttachmentsView } from "../file-attachments-view/file-attachments-view"

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
  const thumbnailGroupName = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const previewTriggerRef = useRef<HTMLElement | null>(null)
  const [fileToDelete, setFileToDelete] = useState<FileDto | null>(null)
  const [previewFileId, setPreviewFileId] = useState<string | null>(null)
  const [thumbnailEditing, setThumbnailEditing] = useState(false)
  const [thumbnailDraftFileId, setThumbnailDraftFileId] = useState<
    string | null
  >(null)
  const filesQuery = useInfiniteQuery(
    filesQueryOptions(apiClient, organizationId, ownerType, ownerId)
  )
  const thumbnailQuery = useQuery({
    ...issueThumbnailQueryOptions(apiClient, organizationId, ownerId),
    enabled: ownerType === "issue" && organizationId.length > 0,
  })
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
  const closeThumbnailEditor = useCallback(() => {
    setThumbnailEditing(false)
    setThumbnailDraftFileId(null)
  }, [])
  const notifyFilesChanged = useCallback(async () => {
    try {
      await onFilesChanged?.()
    } catch {
      // The file mutation remains authoritative when a parent timeline refresh
      // fails. Its normal query retry path can reconcile the stale timeline.
    }
  }, [onFilesChanged])
  const invalidateAttachmentViews = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ownerQueryKey }),
      queryClient.invalidateQueries({
        queryKey: issueKeys.lists(organizationId),
      }),
      ownerType === "issue"
        ? queryClient.invalidateQueries({
            queryKey: issueKeys.thumbnail(organizationId, ownerId),
          })
        : Promise.resolve(),
    ])
  }, [organizationId, ownerId, ownerQueryKey, ownerType, queryClient])
  const handleUploaded = useCallback(async () => {
    closeThumbnailEditor()
    await invalidateAttachmentViews()
    await notifyFilesChanged()
    toast.success("File uploaded")
  }, [closeThumbnailEditor, invalidateAttachmentViews, notifyFilesChanged])
  const handleCanceled = useCallback(async () => {
    await invalidateAttachmentViews()
    await notifyFilesChanged()
  }, [invalidateAttachmentViews, notifyFilesChanged])
  const { uploads, addFiles, retryUpload, cancelUpload } = useFilesController({
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
      closeThumbnailEditor()
      await invalidateAttachmentViews()
      await notifyFilesChanged()
      toast.success("File deleted")
    },
    onError: (error) => {
      showConsoleApiErrorToast(error, "File deletion failed")
    },
  })
  const thumbnailMutation = useMutation({
    mutationFn: (fileId: string) =>
      updateIssueThumbnail(apiClient, {
        id: ownerId,
        organizationId,
        fileId,
      }),
    onSuccess: async (thumbnail) => {
      queryClient.setQueryData(
        issueKeys.thumbnail(organizationId, ownerId),
        thumbnail
      )
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: issueKeys.lists(organizationId),
        }),
        queryClient.invalidateQueries({
          queryKey: issueKeys.detail(organizationId, ownerId),
        }),
      ])
      closeThumbnailEditor()
      toast.success(
        thumbnail.mode === "selected"
          ? "Thumbnail updated"
          : "Thumbnail set to automatic"
      )
    },
    onError: (error) => {
      showConsoleApiErrorToast(error, "Thumbnail update failed")
    },
  })
  const { mutate: mutateDelete, isPending: deletePending } = deleteMutation
  const { mutate: mutateThumbnail, isPending: thumbnailPending } =
    thumbnailMutation
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
  const selectedThumbnailFileId =
    thumbnailQuery.data?.mode === "selected"
      ? (thumbnailQuery.data.file?.id ?? null)
      : null
  const thumbnailChanged =
    thumbnailDraftFileId !== null &&
    thumbnailDraftFileId !== selectedThumbnailFileId
  const openThumbnailEditor = useCallback(() => {
    setThumbnailDraftFileId(
      thumbnailQuery.data?.mode === "selected"
        ? (thumbnailQuery.data.file?.id ?? null)
        : null
    )
    setThumbnailEditing(true)
  }, [thumbnailQuery.data])
  const selectThumbnail = useCallback((fileId: string) => {
    setThumbnailDraftFileId(fileId)
  }, [])
  const confirmThumbnail = useCallback(() => {
    if (thumbnailChanged && thumbnailDraftFileId) {
      mutateThumbnail(thumbnailDraftFileId)
    }
  }, [mutateThumbnail, thumbnailChanged, thumbnailDraftFileId])

  return (
    <FileAttachmentsView
      organizationId={organizationId}
      ownerType={ownerType}
      files={files}
      uploads={uploads}
      inputRef={inputRef}
      selectFiles={selectFiles}
      openPicker={openPicker}
      cancelUpload={cancelUpload}
      retryUpload={retryUpload}
      thumbnailEditing={thumbnailEditing}
      thumbnailPending={thumbnailPending}
      thumbnailQueryPending={thumbnailQuery.isPending}
      thumbnailQueryError={thumbnailQuery.isError}
      closeThumbnailEditor={closeThumbnailEditor}
      thumbnailChanged={thumbnailChanged}
      confirmThumbnail={confirmThumbnail}
      openThumbnailEditor={openThumbnailEditor}
      filesPending={filesQuery.isPending}
      filesError={filesQuery.isError}
      retryList={retryList}
      requestDelete={requestDelete}
      requestPreview={requestPreview}
      selectThumbnail={selectThumbnail}
      thumbnailGroupName={thumbnailGroupName}
      thumbnailDraftFileId={thumbnailDraftFileId}
      hasNextPage={filesQuery.hasNextPage}
      fetchingNextPage={filesQuery.isFetchingNextPage}
      loadMore={loadMore}
      previewableFiles={previewableFiles}
      previewFileId={previewFileId}
      previewTriggerRef={previewTriggerRef}
      selectPreviewFile={selectPreviewFile}
      closePreview={closePreview}
      fileToDelete={fileToDelete}
      handleDeleteOpenChange={handleDeleteOpenChange}
      deletePending={deletePending}
      confirmDelete={confirmDelete}
    />
  )
}
