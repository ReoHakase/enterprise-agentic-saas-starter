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

import type { IssueCommentFormState } from "../use-issue-comment-form/use-issue-comment-form"
import type { IssueDescriptionFormState } from "../use-issue-description-form/use-issue-description-form"
import type { IssueTitleFormState } from "../use-issue-title-form/use-issue-title-form"

const issueHistoryGuardStateKey = "__issueDetailNavigationGuard"

const usePageHistoryGuard = ({
  canonicalHref,
  issueId,
  allowBrowserNavigation,
  hasUnsavedChangesRef,
  navigationConfirmedRef,
  navigationBlockedRef,
  rearmHistoryGuardRef,
  rearmHistoryOnCancelRef,
  setPendingNavigation,
}: {
  canonicalHref: string
  issueId: string
  allowBrowserNavigation: RefObject<boolean>
  hasUnsavedChangesRef: RefObject<() => boolean>
  navigationConfirmedRef: RefObject<boolean>
  navigationBlockedRef: RefObject<boolean>
  rearmHistoryGuardRef: RefObject<(() => void) | null>
  rearmHistoryOnCancelRef: RefObject<boolean>
  setPendingNavigation: Dispatch<SetStateAction<(() => void) | null>>
}) => {
  useEffect(() => {
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
      if (navigationConfirmedRef.current) {
        navigationConfirmedRef.current = false
        continueBrowserBack()
        return
      }
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
    navigationConfirmedRef,
    navigationBlockedRef,
    rearmHistoryGuardRef,
    rearmHistoryOnCancelRef,
    setPendingNavigation,
  ])
}

export const useIssueDetailNavigation = ({
  canonicalHref,
  issueId,
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
  pending?: boolean
  immediateFieldSaving: boolean
  dirtyCommentIds: ReadonlySet<string>
  onRequestClose: () => void
  title: IssueTitleFormState
  description: IssueDescriptionFormState
  comment: IssueCommentFormState
}) => {
  const [pendingNavigation, setPendingNavigation] = useState<
    (() => void) | null
  >(null)
  const allowBrowserNavigation = useRef(false)
  const hasUnsavedChangesRef = useRef<() => boolean>(() => false)
  const navigationConfirmedRef = useRef(false)
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
  usePageHistoryGuard({
    canonicalHref,
    issueId,
    allowBrowserNavigation,
    hasUnsavedChangesRef,
    navigationConfirmedRef,
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
  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!allowBrowserNavigation.current && hasUnsavedChanges()) {
        event.preventDefault()
      }
    }
    window.addEventListener("beforeunload", warnBeforeUnload)
    return () => window.removeEventListener("beforeunload", warnBeforeUnload)
  }, [hasUnsavedChanges])

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
    navigationConfirmedRef.current = true
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
    handleDiscardOpenChange,
  }
}

export type IssueDetailNavigationState = ReturnType<
  typeof useIssueDetailNavigation
>
