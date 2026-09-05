"use client"

import {
  uploadFileWithProgress,
  type FileDto,
} from "@enterprise-agentic-saas/api/client"
import { useCallback, useEffect, useRef, useState } from "react"

import { getConsoleApiErrorText } from "@/features/console"
import { clientEnv } from "@/lib/env"
import { reportObservedError } from "@/lib/report-observed-error"

import type { FileOwnerType } from "../api"
import { MAX_CONCURRENT_FILE_UPLOADS } from "../file-upload-limits"
import {
  registerFileUpload,
  registerFileUploadQueueCancellation,
} from "../uploads"

export type PendingFileUpload = {
  id: string
  uploadId: string
  file: File
  status: "queued" | "uploading" | "failed"
  progress: number
  error?: string
}

type UploadOptions = {
  organizationId: string
  ownerType: FileOwnerType
  ownerId: string
  onUploaded: (file: FileDto) => void | Promise<void>
  onCanceled?: () => void | Promise<void>
}

const safeUploadError =
  "The file could not be uploaded. Check the file and try again."

const newUploadId = () => crypto.randomUUID()

export const useFilesController = ({
  organizationId,
  ownerType,
  ownerId,
  onUploaded,
  onCanceled,
}: UploadOptions) => {
  const [uploads, setUploads] = useState<PendingFileUpload[]>([])
  const uploadsRef = useRef<PendingFileUpload[]>([])
  const queueRef = useRef<PendingFileUpload[]>([])
  const activeRef = useRef(new Map<string, AbortController>())
  const canceledRef = useRef(new Set<string>())
  const unregisterRef = useRef(new Map<string, () => boolean>())
  const pumpRef = useRef<() => void>(() => undefined)
  const onUploadedRef = useRef(onUploaded)
  const onCanceledRef = useRef(onCanceled)

  const updateUpload = useCallback(
    (id: string, update: Partial<PendingFileUpload>) => {
      setUploads((current) =>
        current.map((upload) =>
          upload.id === id ? { ...upload, ...update } : upload
        )
      )
    },
    []
  )

  const removeUpload = useCallback((id: string) => {
    setUploads((current) => current.filter((upload) => upload.id !== id))
  }, [])

  const pump = useCallback(() => {
    while (
      activeRef.current.size < MAX_CONCURRENT_FILE_UPLOADS &&
      queueRef.current.length > 0
    ) {
      const upload = queueRef.current.shift()
      if (!upload || canceledRef.current.delete(upload.id)) continue

      const controller = new AbortController()
      activeRef.current.set(upload.id, controller)
      unregisterRef.current.set(upload.id, registerFileUpload(controller))
      updateUpload(upload.id, {
        status: "uploading",
        progress: 0,
        error: undefined,
      })

      void uploadFileWithProgress({
        baseUrl: clientEnv.VITE_API_BASE_URL,
        organizationId,
        ownerType,
        ownerId,
        uploadId: upload.uploadId,
        file: upload.file,
        signal: controller.signal,
        onProgress: ({ percent }) => {
          updateUpload(upload.id, {
            progress: Math.max(0, Math.min(100, percent)),
          })
        },
      })
        .then(async (file) => {
          removeUpload(upload.id)
          try {
            await onUploadedRef.current(file)
          } catch (error) {
            reportObservedError(error)
            // Upload success remains authoritative when a follow-up cache
            // refresh fails. The stale query will retry through its policy.
          }
          return file
        })
        .catch(async (error: unknown) => {
          if (controller.signal.aborted) {
            if (canceledRef.current.delete(upload.id)) {
              try {
                await onCanceledRef.current?.()
              } catch (callbackError) {
                reportObservedError(callbackError)
                // Keep the owner query stale; its normal retry path will
                // reconcile an upload that committed after the abort.
              }
            }
            removeUpload(upload.id)
            return undefined
          }
          reportObservedError(error)
          updateUpload(upload.id, {
            status: "failed",
            error: getConsoleApiErrorText(error, safeUploadError),
          })
          return undefined
        })
        .finally(() => {
          activeRef.current.delete(upload.id)
          unregisterRef.current.get(upload.id)?.()
          unregisterRef.current.delete(upload.id)
          pumpRef.current()
        })
    }
  }, [organizationId, ownerId, ownerType, removeUpload, updateUpload])
  useEffect(() => {
    uploadsRef.current = uploads
    onUploadedRef.current = onUploaded
    onCanceledRef.current = onCanceled
    pumpRef.current = pump
  }, [onCanceled, onUploaded, pump, uploads])

  const addFiles = useCallback((files: FileList | File[]) => {
    const additions = Array.from(
      files,
      (file): PendingFileUpload => ({
        id: newUploadId(),
        uploadId: newUploadId(),
        file,
        status: "queued",
        progress: 0,
      })
    )
    if (additions.length === 0) return

    queueRef.current.push(...additions)
    setUploads((current) => [...current, ...additions])
    queueMicrotask(() => pumpRef.current())
  }, [])

  const retryUpload = useCallback(
    (id: string) => {
      const upload = uploadsRef.current.find((item) => item.id === id)
      if (!upload || upload.status !== "failed") return

      const queued = {
        ...upload,
        status: "queued" as const,
        progress: 0,
        error: undefined,
      }
      queueRef.current.push(queued)
      updateUpload(id, queued)
      queueMicrotask(() => pumpRef.current())
    },
    [updateUpload]
  )

  const cancelUpload = useCallback(
    (id: string) => {
      canceledRef.current.add(id)
      queueRef.current = queueRef.current.filter((upload) => upload.id !== id)
      const active = activeRef.current.get(id)
      active?.abort()
      if (!active) canceledRef.current.delete(id)
      removeUpload(id)
      queueMicrotask(() => pumpRef.current())
    },
    [removeUpload]
  )

  useEffect(() => {
    const activeUploads = activeRef.current
    const unregisterUploads = unregisterRef.current
    const unregisterQueueCancellation = registerFileUploadQueueCancellation(
      () => {
        queueRef.current = []
        setUploads([])
      }
    )
    setUploads([])
    return () => {
      unregisterQueueCancellation()
      queueRef.current = []
      for (const controller of activeUploads.values()) controller.abort()
      activeUploads.clear()
      for (const unregister of unregisterUploads.values()) unregister()
      unregisterUploads.clear()
    }
  }, [organizationId, ownerId, ownerType])

  return { uploads, addFiles, retryUpload, cancelUpload }
}
