"use client"

import {
  uploadAgentAssetWithProgress,
  type AgentAssetDto,
} from "@enterprise-agentic-saas/api/client"
import { useQueryClient } from "@tanstack/react-query"
import { atom, useAtom, useSetAtom } from "jotai"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react"

import { apiClient } from "@/lib/api-client"
import { clientEnv } from "@/lib/env.client"

import { deleteAgentAsset } from "./api"
import { useAgentFormRegistry } from "./form-registry"
import { agentKeys } from "./queries"
import { agentShellOpenAtom } from "./shell-state"
import type { PendingChatSubmission } from "./submission-identity"

export type StagedAgentAsset = {
  asset: AgentAssetDto
  file: File
  blobUrl: string
}

type AgentThreadDraft = {
  composer: string
  stagedAssets: StagedAgentAsset[]
  uploadingCount: number
  pendingSubmission?: PendingChatSubmission
}

type AgentDraftScopes = Record<string, Record<string, AgentThreadDraft>>

const threadDraftsAtom = atom<AgentDraftScopes>({})
const emptyThreadDraft: AgentThreadDraft = {
  composer: "",
  stagedAssets: [],
  uploadingCount: 0,
}

const draftScopeKey = (userId: string, organizationId: string) =>
  JSON.stringify([userId, organizationId])

type AgentSessionLifecycle = {
  close: () => void
  stop: () => void
  isBusy: () => boolean
  hasPendingApprovals: () => boolean
}

type RegisteredAgentSession = AgentSessionLifecycle & { threadId: string }
type RegisteredUpload = {
  threadId: string
  generation: number
  sizeBytes: number
}

export type OrganizationSwitchRisks = {
  composer: boolean
  uploads: boolean
  stagedAssets: boolean
  activeTurn: boolean
  pendingApprovals: boolean
  dirtyIssueForms: boolean
}

export type AgentThreadSwitchRisks = Omit<
  OrganizationSwitchRisks,
  "dirtyIssueForms"
>

type CompleteThreadSwitchOptions = {
  discardDraft: boolean
}

type AgentRuntimeState = {
  userId: string
  organizationId: string
  frozen: boolean
  getThreadDraft: (threadId: string) => AgentThreadDraft
  setThreadComposer: (threadId: string, value: string) => void
  setThreadPendingSubmission: (
    threadId: string,
    submission: PendingChatSubmission | undefined
  ) => void
  uploadImages: (threadId: string, files: File[]) => Promise<void>
  removeStagedAsset: (threadId: string, assetId: string) => Promise<void>
  clearStagedAssetsAfterSend: (threadId: string) => void
  registerSession: (
    threadId: string,
    lifecycle: AgentSessionLifecycle
  ) => () => void
  beginThreadSwitch: (threadId: string) => AgentThreadSwitchRisks
  cancelThreadSwitch: () => void
  completeThreadSwitch: (
    threadId: string,
    options: CompleteThreadSwitchOptions
  ) => Promise<void>
  beginOrganizationSwitch: () => OrganizationSwitchRisks
  cancelOrganizationSwitch: () => void
  abortOrganizationSwitch: () => void
  completeOrganizationSwitch: () => Promise<void>
}

export type AgentThreadRuntimeState = {
  frozen: boolean
  composer: string
  setComposer: (value: string) => void
  pendingSubmission?: PendingChatSubmission
  setPendingSubmission: (submission: PendingChatSubmission | undefined) => void
  stagedAssets: StagedAgentAsset[]
  uploadingCount: number
  uploadImages: (files: File[]) => Promise<void>
  removeStagedAsset: (assetId: string) => Promise<void>
  clearStagedAssetsAfterSend: () => void
  registerSession: (lifecycle: AgentSessionLifecycle) => () => void
}

const AgentRuntimeContext = createContext<AgentRuntimeState | null>(null)
const allowedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])
const maximumImageBytes = 10_000_000
const maximumImagesTotalBytes = 20_000_000
const maximumImagesPerMessage = 4

export const AgentRuntimeProvider = ({
  userId,
  organizationId,
  children,
}: PropsWithChildren<{ userId: string; organizationId: string }>) => {
  const queryClient = useQueryClient()
  const formRegistry = useAgentFormRegistry()
  const setAgentShellOpen = useSetAtom(agentShellOpenAtom)
  const [draftScopes, setDraftScopes] = useAtom(threadDraftsAtom)
  const [frozen, setFrozen] = useState(false)
  const frozenRef = useRef(false)
  const scopeKey = draftScopeKey(userId, organizationId)
  const scopeKeyRef = useRef(scopeKey)
  const draftsRef = useRef(draftScopes)
  const uploadsRef = useRef(new Map<AbortController, RegisteredUpload>())
  const uploadGenerationsRef = useRef(new Map<string, number>())
  const contextFenceRef = useRef(0)
  const sessionsRef = useRef(new Map<string, RegisteredAgentSession>())

  useEffect(() => {
    draftsRef.current = draftScopes
  }, [draftScopes])
  useEffect(() => {
    if (scopeKeyRef.current === scopeKey) return
    scopeKeyRef.current = scopeKey
    frozenRef.current = false
    setFrozen(false)
    formRegistry.setFrozen(false)
  }, [formRegistry, scopeKey])

  const getThreadDraft = useCallback(
    (threadId: string) => draftScopes[scopeKey]?.[threadId] ?? emptyThreadDraft,
    [draftScopes, scopeKey]
  )
  const updateThreadDraft = useCallback(
    (
      threadId: string,
      update: (current: AgentThreadDraft) => AgentThreadDraft
    ) => {
      setDraftScopes((currentScopes) => {
        const currentScope = currentScopes[scopeKey] ?? {}
        const nextDraft = update(currentScope[threadId] ?? emptyThreadDraft)
        const nextScopes = {
          ...currentScopes,
          [scopeKey]: { ...currentScope, [threadId]: nextDraft },
        }
        draftsRef.current = nextScopes
        return nextScopes
      })
    },
    [scopeKey, setDraftScopes]
  )
  const removeThreadDraft = useCallback(
    (threadId: string) => {
      setDraftScopes((currentScopes) => {
        const currentScope = currentScopes[scopeKey]
        if (!currentScope?.[threadId]) return currentScopes
        const { [threadId]: _removed, ...remainingDrafts } = currentScope
        const nextScopes = { ...currentScopes, [scopeKey]: remainingDrafts }
        draftsRef.current = nextScopes
        return nextScopes
      })
    },
    [scopeKey, setDraftScopes]
  )
  const removeCurrentScope = useCallback(() => {
    setDraftScopes((currentScopes) => {
      if (!currentScopes[scopeKey]) return currentScopes
      const { [scopeKey]: _removed, ...remainingScopes } = currentScopes
      draftsRef.current = remainingScopes
      return remainingScopes
    })
  }, [scopeKey, setDraftScopes])
  const readThreadDraft = useCallback(
    (threadId: string) =>
      draftsRef.current[scopeKey]?.[threadId] ?? emptyThreadDraft,
    [scopeKey]
  )
  const setThreadComposer = useCallback(
    (threadId: string, composer: string) =>
      updateThreadDraft(threadId, (current) => ({ ...current, composer })),
    [updateThreadDraft]
  )
  const setThreadPendingSubmission = useCallback(
    (threadId: string, pendingSubmission: PendingChatSubmission | undefined) =>
      updateThreadDraft(threadId, (current) => ({
        ...current,
        pendingSubmission,
      })),
    [updateThreadDraft]
  )
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
            if (!controller.signal.aborted) throw error
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
    [organizationId, readThreadDraft, updateThreadDraft]
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
  const registerSession = useCallback(
    (threadId: string, lifecycle: AgentSessionLifecycle) => {
      const session = { threadId, ...lifecycle }
      sessionsRef.current.set(threadId, session)
      return () => {
        if (sessionsRef.current.get(threadId) === session)
          sessionsRef.current.delete(threadId)
      }
    },
    []
  )
  const threadSwitchRisks = useCallback(
    (threadId: string): AgentThreadSwitchRisks => {
      const draft = readThreadDraft(threadId)
      const session = sessionsRef.current.get(threadId)
      return {
        composer: draft.composer.trim().length > 0,
        uploads:
          draft.uploadingCount > 0 ||
          [...uploadsRef.current.values()].some(
            (upload) => upload.threadId === threadId
          ),
        stagedAssets: draft.stagedAssets.length > 0,
        activeTurn: session?.isBusy() ?? false,
        pendingApprovals: session?.hasPendingApprovals() ?? false,
      }
    },
    [readThreadDraft]
  )
  const beginThreadSwitch = useCallback(
    (threadId: string) => {
      frozenRef.current = true
      setFrozen(true)
      return threadSwitchRisks(threadId)
    },
    [threadSwitchRisks]
  )
  const cancelThreadSwitch = useCallback(() => {
    frozenRef.current = false
    setFrozen(false)
  }, [])
  const completeThreadSwitch = useCallback(
    async (threadId: string, options: CompleteThreadSwitchOptions) => {
      const session = sessionsRef.current.get(threadId)
      session?.stop()
      session?.close()
      sessionsRef.current.delete(threadId)
      stopThreadUploads(threadId)
      if (!options.discardDraft) return

      const stagedAssets = readThreadDraft(threadId).stagedAssets
      for (const staged of stagedAssets) URL.revokeObjectURL(staged.blobUrl)
      await Promise.allSettled(
        stagedAssets.map((staged) =>
          deleteAgentAsset(apiClient, {
            organizationId,
            assetId: staged.asset.id,
          })
        )
      )
      removeThreadDraft(threadId)
    },
    [organizationId, readThreadDraft, removeThreadDraft, stopThreadUploads]
  )

  const beginOrganizationSwitch = useCallback(() => {
    frozenRef.current = true
    setFrozen(true)
    formRegistry.setFrozen(true)
    const threadIds = Object.keys(draftsRef.current[scopeKey] ?? {})
    const sessions = [...sessionsRef.current.values()]
    return {
      composer: threadIds.some(
        (threadId) => readThreadDraft(threadId).composer.trim().length > 0
      ),
      uploads: uploadsRef.current.size > 0,
      stagedAssets: threadIds.some(
        (threadId) => readThreadDraft(threadId).stagedAssets.length > 0
      ),
      activeTurn: sessions.some((session) => session.isBusy()),
      pendingApprovals: sessions.some((session) =>
        session.hasPendingApprovals()
      ),
      dirtyIssueForms: formRegistry.hasDirtyForms(organizationId),
    }
  }, [formRegistry, organizationId, readThreadDraft, scopeKey])
  const cancelOrganizationSwitch = useCallback(() => {
    frozenRef.current = false
    setFrozen(false)
    formRegistry.setFrozen(false)
  }, [formRegistry])
  const abortOrganizationSwitch = useCallback(() => {
    // Server-side context revocation must complete before this phase starts.
    // Fence late old-context upload responses before aborting them so they
    // cannot issue DELETE with a subsequently active session context.
    contextFenceRef.current += 1
    for (const session of sessionsRef.current.values()) {
      session.stop()
      session.close()
    }
    sessionsRef.current.clear()
    const threadDrafts = draftsRef.current[scopeKey] ?? {}
    for (const threadId of Object.keys(threadDrafts))
      stopThreadUploads(threadId)
  }, [scopeKey, stopThreadUploads])
  const completeOrganizationSwitch = useCallback(async () => {
    // Local drafts survive until organization/account activation succeeds.
    // Calling abort again is intentional and makes this boundary fail closed
    // for callers that cannot split the two phases.
    abortOrganizationSwitch()
    await queryClient.cancelQueries({ queryKey: agentKeys.all })
    queryClient.removeQueries({ queryKey: agentKeys.all })
    setAgentShellOpen(false)
    const threadDrafts = draftsRef.current[scopeKey] ?? {}
    const stagedAssets = Object.values(threadDrafts).flatMap(
      (draft) => draft.stagedAssets
    )
    for (const staged of stagedAssets) URL.revokeObjectURL(staged.blobUrl)
    // active organization/accountの更新後は、旧tenant assetを現在sessionで
    // DELETEしない。server lifecycleをcleanupの正本にし、cross-tenantに
    // 見えるbest-effort requestを発生させない。
    removeCurrentScope()
    formRegistry.clear()
  }, [
    abortOrganizationSwitch,
    formRegistry,
    queryClient,
    removeCurrentScope,
    setAgentShellOpen,
    scopeKey,
  ])

  useEffect(
    () => () => {
      contextFenceRef.current += 1
      for (const controller of uploadsRef.current.keys()) controller.abort()
      for (const session of sessionsRef.current.values()) {
        session.stop()
        session.close()
      }
      sessionsRef.current.clear()
      const threadDrafts = draftsRef.current[scopeKey] ?? {}
      for (const staged of Object.values(threadDrafts).flatMap(
        (draft) => draft.stagedAssets
      )) {
        URL.revokeObjectURL(staged.blobUrl)
      }
      removeCurrentScope()
    },
    [removeCurrentScope, scopeKey]
  )

  const value = useMemo<AgentRuntimeState>(
    () => ({
      userId,
      organizationId,
      frozen,
      getThreadDraft,
      setThreadComposer,
      setThreadPendingSubmission,
      uploadImages,
      removeStagedAsset,
      clearStagedAssetsAfterSend,
      registerSession,
      beginThreadSwitch,
      cancelThreadSwitch,
      completeThreadSwitch,
      beginOrganizationSwitch,
      cancelOrganizationSwitch,
      abortOrganizationSwitch,
      completeOrganizationSwitch,
    }),
    [
      abortOrganizationSwitch,
      beginOrganizationSwitch,
      beginThreadSwitch,
      cancelOrganizationSwitch,
      cancelThreadSwitch,
      clearStagedAssetsAfterSend,
      completeOrganizationSwitch,
      completeThreadSwitch,
      frozen,
      getThreadDraft,
      organizationId,
      registerSession,
      removeStagedAsset,
      setThreadComposer,
      setThreadPendingSubmission,
      uploadImages,
      userId,
    ]
  )

  return (
    <AgentRuntimeContext.Provider value={value}>
      {children}
    </AgentRuntimeContext.Provider>
  )
}

export const useAgentRuntimeState = () => {
  const value = useContext(AgentRuntimeContext)
  if (!value)
    throw new Error("useAgentRuntimeState requires AgentRuntimeProvider")
  return value
}

export const useAgentThreadRuntimeState = (
  threadId: string
): AgentThreadRuntimeState => {
  const runtime = useAgentRuntimeState()
  const draft = runtime.getThreadDraft(threadId)
  const {
    setThreadComposer,
    setThreadPendingSubmission,
    uploadImages: uploadThreadImages,
    removeStagedAsset: removeThreadStagedAsset,
    clearStagedAssetsAfterSend: clearThreadStagedAssetsAfterSend,
    registerSession: registerThreadSession,
  } = runtime
  const setComposer = useCallback(
    (value: string) => setThreadComposer(threadId, value),
    [setThreadComposer, threadId]
  )
  const setPendingSubmission = useCallback(
    (submission: PendingChatSubmission | undefined) =>
      setThreadPendingSubmission(threadId, submission),
    [setThreadPendingSubmission, threadId]
  )
  const uploadImages = useCallback(
    (files: File[]) => uploadThreadImages(threadId, files),
    [threadId, uploadThreadImages]
  )
  const removeStagedAsset = useCallback(
    (assetId: string) => removeThreadStagedAsset(threadId, assetId),
    [removeThreadStagedAsset, threadId]
  )
  const clearStagedAssetsAfterSend = useCallback(
    () => clearThreadStagedAssetsAfterSend(threadId),
    [clearThreadStagedAssetsAfterSend, threadId]
  )
  const registerSession = useCallback(
    (lifecycle: AgentSessionLifecycle) =>
      registerThreadSession(threadId, lifecycle),
    [registerThreadSession, threadId]
  )
  return useMemo(
    () => ({
      frozen: runtime.frozen,
      composer: draft.composer,
      setComposer,
      pendingSubmission: draft.pendingSubmission,
      setPendingSubmission,
      stagedAssets: draft.stagedAssets,
      uploadingCount: draft.uploadingCount,
      uploadImages,
      removeStagedAsset,
      clearStagedAssetsAfterSend,
      registerSession,
    }),
    [
      clearStagedAssetsAfterSend,
      draft.composer,
      draft.pendingSubmission,
      draft.stagedAssets,
      draft.uploadingCount,
      registerSession,
      removeStagedAsset,
      runtime.frozen,
      setComposer,
      setPendingSubmission,
      uploadImages,
    ]
  )
}

export const hasOrganizationSwitchRisks = (risks: OrganizationSwitchRisks) =>
  Object.values(risks).some(Boolean)

export const hasBlockingThreadSwitchRisks = (risks: AgentThreadSwitchRisks) =>
  risks.uploads || risks.activeTurn || risks.pendingApprovals
