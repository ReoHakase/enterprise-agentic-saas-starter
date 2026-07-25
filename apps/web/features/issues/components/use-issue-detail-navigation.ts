"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react"

import {
  draftHandoffKey,
  parseDraftHandoff,
  type DraftHandoff,
} from "./issue-detail-draft-handoff"
import { useIssueModalNavigation } from "./issue-modal-route-shell"
import type { IssueCommentFormState } from "./use-issue-comment-form"
import type { IssueDescriptionFormState } from "./use-issue-description-form"
import type { IssueTitleFormState } from "./use-issue-title-form"

const issueHistoryGuardStateKey = "__issueDetailNavigationGuard"

const useDraftHandoffRestore = ({
  canonicalHref,
  issueId,
  mode,
  title,
  description,
  comment,
}: {
  canonicalHref: string
  issueId: string
  mode: "modal" | "page"
  title: IssueTitleFormState
  description: IssueDescriptionFormState
  comment: IssueCommentFormState
}) => {
  const titleApplyDraft = title.applyDraft
  const descriptionApplyDraft = description.applyDraft
  const commentForm = comment.form
  useEffect(() => {
    if (mode !== "page") return
    const key = draftHandoffKey(canonicalHref)
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return
    window.sessionStorage.removeItem(key)

    try {
      const draft = parseDraftHandoff(JSON.parse(raw), issueId)
      if (!draft) return
      if (draft.titleEditing) titleApplyDraft(draft.title)
      if (draft.descriptionEditing) {
        descriptionApplyDraft(draft.description)
      }
      if (draft.comment) commentForm.setFieldValue("body", draft.comment)
    } catch {
      // Invalid or stale handoff data is intentionally discarded.
    }
  }, [
    canonicalHref,
    commentForm,
    descriptionApplyDraft,
    issueId,
    mode,
    titleApplyDraft,
  ])
}

const usePageHistoryGuard = ({
  canonicalHref,
  issueId,
  mode,
  allowBrowserNavigation,
  hasUnsavedChangesRef,
  navigationBlockedRef,
  rearmHistoryGuardRef,
  rearmHistoryOnCancelRef,
  setPendingNavigation,
}: {
  canonicalHref: string
  issueId: string
  mode: "modal" | "page"
  allowBrowserNavigation: RefObject<boolean>
  hasUnsavedChangesRef: RefObject<() => boolean>
  navigationBlockedRef: RefObject<boolean>
  rearmHistoryGuardRef: RefObject<(() => void) | null>
  rearmHistoryOnCancelRef: RefObject<boolean>
  setPendingNavigation: Dispatch<SetStateAction<(() => void) | null>>
}) => {
  useEffect(() => {
    if (mode !== "page") return

    const guardMarker = `${canonicalHref}:${issueId}`
    const rearmHistoryGuard = () => {
      const currentState = window.history.state
      if (
        currentState &&
        typeof currentState === "object" &&
        currentState[issueHistoryGuardStateKey] === guardMarker
      ) {
        return
      }
      const nextState =
        currentState && typeof currentState === "object"
          ? { ...currentState, [issueHistoryGuardStateKey]: guardMarker }
          : { [issueHistoryGuardStateKey]: guardMarker }
      window.history.pushState(nextState, "", window.location.href)
    }
    const continueBrowserBack = () => {
      rearmHistoryOnCancelRef.current = false
      allowBrowserNavigation.current = true
      window.setTimeout(() => window.history.back(), 0)
    }
    const handleBrowserBack = () => {
      if (allowBrowserNavigation.current) return
      if (navigationBlockedRef.current) {
        rearmHistoryGuard()
        return
      }
      if (hasUnsavedChangesRef.current()) {
        rearmHistoryOnCancelRef.current = true
        setPendingNavigation(() => continueBrowserBack)
        return
      }
      continueBrowserBack()
    }

    rearmHistoryGuardRef.current = rearmHistoryGuard
    rearmHistoryGuard()
    window.addEventListener("popstate", handleBrowserBack)
    return () => {
      window.removeEventListener("popstate", handleBrowserBack)
      if (rearmHistoryGuardRef.current === rearmHistoryGuard) {
        rearmHistoryGuardRef.current = null
      }
    }
  }, [
    allowBrowserNavigation,
    canonicalHref,
    hasUnsavedChangesRef,
    issueId,
    mode,
    navigationBlockedRef,
    rearmHistoryGuardRef,
    rearmHistoryOnCancelRef,
    setPendingNavigation,
  ])
}

export const useIssueDetailNavigation = ({
  canonicalHref,
  issueId,
  mode,
  pending,
  immediateFieldSaving,
  dirtyCommentIds,
  onRequestClose,
  title,
  description,
  comment,
}: {
  canonicalHref: string
  issueId: string
  mode: "modal" | "page"
  pending?: boolean
  immediateFieldSaving: boolean
  dirtyCommentIds: ReadonlySet<string>
  onRequestClose: () => void
  title: IssueTitleFormState
  description: IssueDescriptionFormState
  comment: IssueCommentFormState
}) => {
  const [error, setError] = useState<string>()
  const [pendingNavigation, setPendingNavigation] = useState<
    (() => void) | null
  >(null)
  const allowBrowserNavigation = useRef(false)
  const hasUnsavedChangesRef = useRef<() => boolean>(() => false)
  const navigationBlockedRef = useRef(false)
  const rearmHistoryGuardRef = useRef<(() => void) | null>(null)
  const rearmHistoryOnCancelRef = useRef(false)
  const titleForm = title.form
  const descriptionForm = description.form
  const commentForm = comment.form
  const hasUnsavedChanges = useCallback(
    () =>
      (title.editing && titleForm.state.isDirty) ||
      (description.editing && descriptionForm.state.isDirty) ||
      commentForm.state.isDirty ||
      dirtyCommentIds.size > 0,
    [
      commentForm,
      description.editing,
      descriptionForm,
      dirtyCommentIds,
      title.editing,
      titleForm,
    ]
  )
  const blocked = Boolean(pending) || immediateFieldSaving
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges
  }, [hasUnsavedChanges])
  useEffect(() => {
    navigationBlockedRef.current = blocked
  }, [blocked])
  useDraftHandoffRestore({
    canonicalHref,
    issueId,
    mode,
    title,
    description,
    comment,
  })
  usePageHistoryGuard({
    canonicalHref,
    issueId,
    mode,
    allowBrowserNavigation,
    hasUnsavedChangesRef,
    navigationBlockedRef,
    rearmHistoryGuardRef,
    rearmHistoryOnCancelRef,
    setPendingNavigation,
  })

  const request = useCallback(
    (action: () => void) => {
      if (blocked) return
      if (hasUnsavedChanges()) {
        setPendingNavigation(() => action)
        return
      }
      action()
    },
    [blocked, hasUnsavedChanges]
  )
  const close = useCallback(
    () => request(onRequestClose),
    [onRequestClose, request]
  )
  useIssueModalNavigation(mode === "modal" ? close : undefined)
  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!allowBrowserNavigation.current && hasUnsavedChanges()) {
        event.preventDefault()
      }
    }
    window.addEventListener("beforeunload", warnBeforeUnload)
    return () => window.removeEventListener("beforeunload", warnBeforeUnload)
  }, [hasUnsavedChanges])

  const navigateToFullPage = useCallback(
    (allowDiscard = false) => {
      setError(undefined)
      try {
        const draft: DraftHandoff = {
          version: 1,
          issueId,
          expiresAt: Date.now() + 60_000,
          title: titleForm.state.values.title,
          titleEditing: title.editing,
          description: descriptionForm.state.values.description,
          descriptionEditing: description.editing,
          comment: commentForm.state.values.body,
        }
        window.sessionStorage.setItem(
          draftHandoffKey(canonicalHref),
          JSON.stringify(draft)
        )
      } catch {
        if (!allowDiscard && hasUnsavedChanges()) {
          setError(
            "Drafts could not be transferred to the full-page view. Keep editing here or discard them first."
          )
          return
        }
      }
      allowBrowserNavigation.current = true
      window.location.assign(canonicalHref)
    },
    [
      canonicalHref,
      commentForm,
      description.editing,
      descriptionForm,
      hasUnsavedChanges,
      issueId,
      title.editing,
      titleForm,
    ]
  )
  const openFullPage = useCallback(() => {
    if (blocked) return
    setError(undefined)
    if (dirtyCommentIds.size > 0) {
      setPendingNavigation(() => () => navigateToFullPage(true))
      return
    }
    navigateToFullPage()
  }, [blocked, dirtyCommentIds.size, navigateToFullPage])
  const cancelDiscard = useCallback(() => {
    setPendingNavigation(null)
    if (rearmHistoryOnCancelRef.current) {
      rearmHistoryOnCancelRef.current = false
      rearmHistoryGuardRef.current?.()
    }
  }, [])
  const confirmDiscard = useCallback(() => {
    const action = pendingNavigation
    rearmHistoryOnCancelRef.current = false
    setPendingNavigation(null)
    allowBrowserNavigation.current = true
    action?.()
  }, [pendingNavigation])
  const handleDiscardOpenChange = useCallback(
    (open: boolean) => {
      if (!open) cancelDiscard()
    },
    [cancelDiscard]
  )

  return {
    backToIssues: close,
    blocked,
    cancelDiscard,
    confirmDiscard,
    discardOpen: pendingNavigation !== null,
    error,
    handleDiscardOpenChange,
    openFullPage,
  }
}

export type IssueDetailNavigationState = ReturnType<
  typeof useIssueDetailNavigation
>
