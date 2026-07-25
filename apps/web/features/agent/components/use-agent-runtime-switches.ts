import { useQueryClient } from "@tanstack/react-query"
import { useSetAtom } from "jotai"
import { useCallback, useEffect, useRef } from "react"

import { apiClient } from "@/lib/api-client"

import { deleteAgentAsset } from "../api"
import { agentKeys } from "../queries"
import { agentShellOpenAtom } from "../shell-state"
import { useAgentFormRegistry } from "./form-registry"
import type {
  AgentDraftScopes,
  AgentSessionLifecycle,
  AgentThreadDraft,
  AgentThreadSwitchRisks,
  CompleteThreadSwitchOptions,
  RegisteredAgentSession,
  RegisteredUpload,
} from "./runtime-state-types"

export const useAgentRuntimeSwitches = ({
  contextFenceRef,
  draftsRef,
  frozenRef,
  organizationId,
  readThreadDraft,
  removeCurrentScope,
  removeThreadDraft,
  scopeKey,
  setFrozen,
  stopThreadUploads,
  uploadsRef,
}: {
  contextFenceRef: { current: number }
  draftsRef: { current: AgentDraftScopes }
  frozenRef: { current: boolean }
  organizationId: string
  readThreadDraft: (threadId: string) => AgentThreadDraft
  removeCurrentScope: () => void
  removeThreadDraft: (threadId: string) => void
  scopeKey: string
  setFrozen: (frozen: boolean) => void
  stopThreadUploads: (threadId: string) => void
  uploadsRef: { current: Map<AbortController, RegisteredUpload> }
}) => {
  const queryClient = useQueryClient()
  const formRegistry = useAgentFormRegistry()
  const setAgentShellOpen = useSetAtom(agentShellOpenAtom)
  const scopeKeyRef = useRef(scopeKey)
  const sessionsRef = useRef(new Map<string, RegisteredAgentSession>())

  useEffect(() => {
    if (scopeKeyRef.current === scopeKey) return
    scopeKeyRef.current = scopeKey
    frozenRef.current = false
    setFrozen(false)
    formRegistry.setFrozen(false)
  }, [formRegistry, frozenRef, scopeKey, setFrozen])

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
    [readThreadDraft, uploadsRef]
  )
  const beginThreadSwitch = useCallback(
    (threadId: string) => {
      frozenRef.current = true
      setFrozen(true)
      return threadSwitchRisks(threadId)
    },
    [frozenRef, setFrozen, threadSwitchRisks]
  )
  const cancelThreadSwitch = useCallback(() => {
    frozenRef.current = false
    setFrozen(false)
  }, [frozenRef, setFrozen])
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
  }, [
    draftsRef,
    formRegistry,
    frozenRef,
    organizationId,
    readThreadDraft,
    scopeKey,
    setFrozen,
    uploadsRef,
  ])
  const cancelOrganizationSwitch = useCallback(() => {
    frozenRef.current = false
    setFrozen(false)
    formRegistry.setFrozen(false)
  }, [formRegistry, frozenRef, setFrozen])
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
  }, [contextFenceRef, draftsRef, scopeKey, stopThreadUploads])
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
    draftsRef,
    formRegistry,
    queryClient,
    removeCurrentScope,
    scopeKey,
    setAgentShellOpen,
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
    [contextFenceRef, draftsRef, removeCurrentScope, scopeKey, uploadsRef]
  )

  return {
    abortOrganizationSwitch,
    beginOrganizationSwitch,
    beginThreadSwitch,
    cancelOrganizationSwitch,
    cancelThreadSwitch,
    completeOrganizationSwitch,
    completeThreadSwitch,
    registerSession,
  }
}
