"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react"

import type { PendingChatSubmission } from "../submission-identity"
import {
  type AgentRuntimeState,
  type AgentSessionLifecycle,
  type AgentThreadRuntimeState,
  type AgentThreadSwitchRisks,
  type OrganizationSwitchRisks,
} from "./runtime-state-types"
import { useAgentDraftStore } from "./use-agent-draft-store"
import { useAgentRuntimeSwitches } from "./use-agent-runtime-switches"
import { useAgentRuntimeUploads } from "./use-agent-runtime-uploads"

export {
  type AgentThreadRuntimeState,
  type AgentThreadSwitchRisks,
  type OrganizationSwitchRisks,
  type StagedAgentAsset,
} from "./runtime-state-types"

const AgentRuntimeContext = createContext<AgentRuntimeState | null>(null)

export const AgentRuntimeProvider = ({
  userId,
  organizationId,
  children,
}: PropsWithChildren<{ userId: string; organizationId: string }>) => {
  const [frozen, setFrozen] = useState(false)
  const frozenRef = useRef(false)
  const draftStore = useAgentDraftStore(userId, organizationId)
  const uploads = useAgentRuntimeUploads({
    frozenRef,
    organizationId,
    readThreadDraft: draftStore.readThreadDraft,
    updateThreadDraft: draftStore.updateThreadDraft,
  })
  const switches = useAgentRuntimeSwitches({
    contextFenceRef: uploads.contextFenceRef,
    draftsRef: draftStore.draftsRef,
    frozenRef,
    organizationId,
    readThreadDraft: draftStore.readThreadDraft,
    removeCurrentScope: draftStore.removeCurrentScope,
    removeThreadDraft: draftStore.removeThreadDraft,
    scopeKey: draftStore.scopeKey,
    setFrozen,
    stopThreadUploads: uploads.stopThreadUploads,
    uploadsRef: uploads.uploadsRef,
  })
  const value = useMemo<AgentRuntimeState>(
    () => ({
      userId,
      organizationId,
      frozen,
      getThreadDraft: draftStore.getThreadDraft,
      setThreadComposer: draftStore.setThreadComposer,
      setThreadPendingSubmission: draftStore.setThreadPendingSubmission,
      uploadImages: uploads.uploadImages,
      removeStagedAsset: uploads.removeStagedAsset,
      clearStagedAssetsAfterSend: uploads.clearStagedAssetsAfterSend,
      registerSession: switches.registerSession,
      beginThreadSwitch: switches.beginThreadSwitch,
      cancelThreadSwitch: switches.cancelThreadSwitch,
      completeThreadSwitch: switches.completeThreadSwitch,
      beginOrganizationSwitch: switches.beginOrganizationSwitch,
      cancelOrganizationSwitch: switches.cancelOrganizationSwitch,
      abortOrganizationSwitch: switches.abortOrganizationSwitch,
      completeOrganizationSwitch: switches.completeOrganizationSwitch,
    }),
    [
      draftStore.getThreadDraft,
      draftStore.setThreadComposer,
      draftStore.setThreadPendingSubmission,
      frozen,
      organizationId,
      switches.abortOrganizationSwitch,
      switches.beginOrganizationSwitch,
      switches.beginThreadSwitch,
      switches.cancelOrganizationSwitch,
      switches.cancelThreadSwitch,
      switches.completeOrganizationSwitch,
      switches.completeThreadSwitch,
      switches.registerSession,
      uploads.clearStagedAssetsAfterSend,
      uploads.removeStagedAsset,
      uploads.uploadImages,
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
