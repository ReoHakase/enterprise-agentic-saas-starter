import { uploadAgentAssetWithProgress } from "@enterprise-agentic-saas/api/client"
import { useCallback, useRef } from "react"

import { apiClient } from "@/lib/api-client"
import { clientEnv } from "@/lib/env.client"

import { deleteAgentAsset } from "../../api"
import {
  allowedImageTypes,
  maximumImageBytes,
  maximumImagesPerMessage,
  maximumImagesTotalBytes,
  toAgentImageUploadError,
  type AgentThreadDraft,
  type RegisteredUpload,
} from "../runtime-state-types/runtime-state-types"

export const useAgentRuntimeUploads = ({
  frozenRef,
  organizationId,
  readThreadDraft,
  updateThreadDraft,
}: {
  frozenRef: { current: boolean }
  organizationId: string
  readThreadDraft: (threadId: string) => AgentThreadDraft
  updateThreadDraft: (
    threadId: string,
    update: (current: AgentThreadDraft) => AgentThreadDraft
  ) => void
}) => {
  const uploadsRef = useRef(new Map<AbortController, RegisteredUpload>())
  const uploadGenerationsRef = useRef(new Map<string, number>())
  const contextFenceRef = useRef(0)
  const currentUploadGeneration = useCallback(
    (threadId: string) => uploadGenerationsRef.current.get(threadId) ?? 0,
    []
  )
  const stopThreadUploads = useCallback(
    (threadId: string) => {
      uploadGenerationsRef.current.set(
        threadId,
        currentUploadGeneration(threadId) + 1
      )
      for (const [controller, upload] of uploadsRef.current) {
        if (upload.threadId !== threadId) continue
        controller.abort()
        uploadsRef.current.delete(controller)
      }
      updateThreadDraft(threadId, (current) => ({
        ...current,
        uploadingCount: 0,
      }))
    },
    [currentUploadGeneration, updateThreadDraft]
  )
  const uploadImages = useCallback(
    async (threadId: string, files: File[]) => {
      if (frozenRef.current)
        throw new Error("Agent context switching is in progress.")
      const draft = readThreadDraft(threadId)
      const activeUploads = [...uploadsRef.current.values()].filter(
        (upload) => upload.threadId === threadId
      )
      if (
        draft.stagedAssets.length + activeUploads.length + files.length >
        maximumImagesPerMessage
      ) {
        throw new Error("Attach no more than four images to one message.")
      }
      const totalBytes = [
        ...draft.stagedAssets.map((item) => item.file.size),
        ...activeUploads.map((upload) => upload.sizeBytes),
        ...files.map((file) => file.size),
      ].reduce((total, size) => total + size, 0)
      if (totalBytes > maximumImagesTotalBytes) {
        throw new Error("The images in one message must total 20 MB or less.")
      }
      for (const file of files) {
        if (
          !allowedImageTypes.has(file.type) ||
          file.size > maximumImageBytes
        ) {
          throw new Error("Use a JPEG, PNG, WebP, or GIF image up to 10 MB.")
        }
      }

      await Promise.all(
        files.map(async (file) => {
          const controller = new AbortController()
          const generation = currentUploadGeneration(threadId)
          const contextFence = contextFenceRef.current
          uploadsRef.current.set(controller, {
            threadId,
            generation,
            sizeBytes: file.size,
          })
          updateThreadDraft(threadId, (current) => ({
            ...current,
            uploadingCount: current.uploadingCount + 1,
          }))
          try {
            const asset = await uploadAgentAssetWithProgress({
              baseUrl: clientEnv.NEXT_PUBLIC_API_BASE_URL,
              organizationId,
              threadId,
              uploadId: crypto.randomUUID(),
              file,
              signal: controller.signal,
            })
            if (contextFence !== contextFenceRef.current) return
            if (generation !== currentUploadGeneration(threadId)) {
              await deleteAgentAsset(apiClient, {
                organizationId,
                assetId: asset.id,
              }).catch(() => undefined)
              return
            }
            const staged = { asset, file, blobUrl: URL.createObjectURL(file) }
            updateThreadDraft(threadId, (current) => ({
              ...current,
              stagedAssets: [...current.stagedAssets, staged],
            }))
          } catch (error) {
            if (!controller.signal.aborted) throw toAgentImageUploadError(error)
          } finally {
            uploadsRef.current.delete(controller)
            if (
              contextFence === contextFenceRef.current &&
              generation === currentUploadGeneration(threadId)
            ) {
              updateThreadDraft(threadId, (current) => ({
                ...current,
                uploadingCount: Math.max(0, current.uploadingCount - 1),
              }))
            }
          }
        })
      )
    },
    [
      currentUploadGeneration,
      frozenRef,
      organizationId,
      readThreadDraft,
      updateThreadDraft,
    ]
  )
  const removeStagedAsset = useCallback(
    async (threadId: string, assetId: string) => {
      if (frozenRef.current)
        throw new Error("Agent context switching is in progress.")
      const staged = readThreadDraft(threadId).stagedAssets.find(
        (item) => item.asset.id === assetId
      )
      if (!staged) return
      URL.revokeObjectURL(staged.blobUrl)
      updateThreadDraft(threadId, (current) => ({
        ...current,
        stagedAssets: current.stagedAssets.filter(
          (item) => item.asset.id !== assetId
        ),
      }))
      await deleteAgentAsset(apiClient, { organizationId, assetId })
    },
    [frozenRef, organizationId, readThreadDraft, updateThreadDraft]
  )
  const clearStagedAssetsAfterSend = useCallback(
    (threadId: string) => {
      for (const staged of readThreadDraft(threadId).stagedAssets)
        URL.revokeObjectURL(staged.blobUrl)
      updateThreadDraft(threadId, (current) => ({
        ...current,
        stagedAssets: [],
      }))
    },
    [readThreadDraft, updateThreadDraft]
  )

  return {
    clearStagedAssetsAfterSend,
    contextFenceRef,
    removeStagedAsset,
    stopThreadUploads,
    uploadImages,
    uploadsRef,
  }
}
