import type { UseChatHelpers } from "@ai-sdk/react"
import { useCallback, type ChangeEvent } from "react"
import { toast } from "sonner"

import type {
  AgentComposerHandle,
  AgentComposerSnapshot,
} from "../components/agent-composer/agent-composer"
import type { useAgentThreadRuntimeState } from "../components/runtime-state/runtime-state"
import type { AgentChatMessage } from "../schema"
import {
  resolveAgentSubmissionIdentity,
  type PendingChatSubmission,
} from "../submission-identity"
import { hasComposerContent } from "./agent-controller-support"

type AgentThreadRuntime = ReturnType<typeof useAgentThreadRuntimeState>
type AgentSubmitEvent = { preventDefault: () => void }

export const useAgentSubmission = ({
  beginTurn,
  busyRef,
  cancelState,
  composerRef,
  disabled,
  pendingComposerSnapshotRef,
  pendingSubmissionRef,
  runtime,
  sendMessage,
  setSendingAssetIds,
}: {
  beginTurn: () => void
  busyRef: { current: boolean }
  cancelState: "idle" | "canceling" | "failed"
  composerRef: { current: AgentComposerHandle | null }
  disabled: boolean
  pendingComposerSnapshotRef: {
    current: AgentComposerSnapshot | undefined
  }
  pendingSubmissionRef: { current: PendingChatSubmission | undefined }
  runtime: AgentThreadRuntime
  sendMessage: UseChatHelpers<AgentChatMessage>["sendMessage"]
  setSendingAssetIds: (assetIds: string[]) => void
}) => {
  const submitMessage = useCallback(
    async (event: AgentSubmitEvent) => {
      event.preventDefault()
      if (
        disabled ||
        runtime.frozen ||
        busyRef.current ||
        cancelState !== "idle" ||
        runtime.uploadingCount > 0
      )
        return
      const composer = composerRef.current
      if (!composer) return
      beginTurn()
      const snapshot = composer.snapshot()
      const assets = runtime.stagedAssets.map(({ asset }) => ({
        id: asset.id,
        filename: asset.filename,
        sizeBytes: asset.sizeBytes,
        imageWidth: asset.imageWidth,
        imageHeight: asset.imageHeight,
        expiresAt: asset.expiresAt,
      }))
      if (!hasComposerContent(snapshot) && assets.length === 0) return
      const contentParts = hasComposerContent(snapshot)
        ? snapshot.parts
        : [
            {
              type: "text" as const,
              text: "Please review the attached images.",
            },
          ]
      const assetIds = assets.map((asset) => asset.id)
      const fingerprint = JSON.stringify([contentParts, assetIds])
      const submission = resolveAgentSubmissionIdentity(
        pendingSubmissionRef.current,
        fingerprint,
        () => crypto.randomUUID()
      )
      pendingSubmissionRef.current = submission.pending
      runtime.setPendingSubmission(submission.pending)
      pendingComposerSnapshotRef.current = snapshot
      composer.clear()
      runtime.setComposer("")
      setSendingAssetIds(assetIds)
      try {
        await sendMessage({
          id: submission.id,
          role: "user",
          parts: [
            ...contentParts,
            ...(assets.length > 0
              ? [
                  {
                    type: "data-agent-assets" as const,
                    data: { assetIds, assets },
                  },
                ]
              : []),
          ],
          messageId: submission.retrying ? submission.id : undefined,
        })
      } catch {
        setSendingAssetIds([])
        const current = composerRef.current?.snapshot()
        if (current && !hasComposerContent(current)) {
          composerRef.current?.restore(snapshot)
        }
        toast.error("The message could not be sent. Your local draft was kept.")
      }
    },
    [
      beginTurn,
      busyRef,
      cancelState,
      composerRef,
      disabled,
      pendingComposerSnapshotRef,
      pendingSubmissionRef,
      runtime,
      sendMessage,
      setSendingAssetIds,
    ]
  )
  const attachImages = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = [...(event.target.files ?? [])]
      event.target.value = ""
      if (files.length === 0) return
      void runtime.uploadImages(files).catch((error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : "Image upload failed."
        )
      })
    },
    [runtime]
  )
  return { attachImages, submitMessage }
}
