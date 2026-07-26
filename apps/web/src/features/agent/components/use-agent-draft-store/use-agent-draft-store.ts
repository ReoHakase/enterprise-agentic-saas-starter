import { useAtom } from "jotai"
import { useCallback, useEffect, useRef } from "react"

import type { PendingChatSubmission } from "../../submission-identity"
import {
  draftScopeKey,
  emptyThreadDraft,
  threadDraftsAtom,
  type AgentThreadDraft,
} from "../runtime-state-types/runtime-state-types"

export const useAgentDraftStore = (userId: string, organizationId: string) => {
  const [draftScopes, setDraftScopes] = useAtom(threadDraftsAtom)
  const scopeKey = draftScopeKey(userId, organizationId)
  const draftsRef = useRef(draftScopes)

  useEffect(() => {
    draftsRef.current = draftScopes
  }, [draftScopes])

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

  return {
    draftsRef,
    getThreadDraft,
    readThreadDraft,
    removeCurrentScope,
    removeThreadDraft,
    scopeKey,
    setThreadComposer,
    setThreadPendingSubmission,
    updateThreadDraft,
  }
}
