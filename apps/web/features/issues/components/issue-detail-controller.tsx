"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useCallback, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { showConsoleApiErrorToast } from "@/features/console/error-toast"
import {
  createIssueComment,
  deleteIssueComment,
  getIssueTimeline,
  updateIssue,
  updateIssueComment,
} from "@/features/issues/api"
import {
  getIssueUpdateFields,
  issueUpdateFields,
  mergeIssueUpdateResponse,
  type IssueUpdateField,
} from "@/features/issues/issue-update-state"
import { issueKeys } from "@/features/issues/queries"
import type {
  Issue,
  IssueTimelinePage,
  IssueTimelineItem,
} from "@/features/issues/schema"
import { apiClient } from "@/lib/api-client"

import { IssueDetailDialog } from "./issue-detail-dialog"
import type { IssueAssigneeOption, IssueUiItem, IssueUpdate } from "./types"

const emptyLabelSuggestions: string[] = []

export const IssueDetailController = ({
  initialIssue,
  initialTimeline,
  assignees,
  labelSuggestions = emptyLabelSuggestions,
  organizationId,
  canonicalHref,
  mode,
}: {
  initialIssue: Issue
  initialTimeline: IssueTimelinePage
  assignees: IssueAssigneeOption[]
  labelSuggestions?: string[]
  organizationId: string
  canonicalHref: string
  mode: "modal" | "page"
}) => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [issue, setIssue] = useState(initialIssue)
  const issueRef = useRef(initialIssue)
  const [timeline, setTimeline] = useState<IssueTimelineItem[]>(
    initialTimeline.items
  )
  const [nextCursor, setNextCursor] = useState(initialTimeline.nextCursor)
  const [pendingUpdateCounts, setPendingUpdateCounts] = useState<
    Partial<Record<IssueUpdateField, number>>
  >({})
  const updateQueueRef = useRef<Promise<void>>(Promise.resolve())
  const timelineRefreshIdRef = useRef(0)

  const refreshTimeline = useCallback(async () => {
    const refreshId = ++timelineRefreshIdRef.current
    const page = await getIssueTimeline(apiClient, {
      id: issue.id,
      organizationId,
      limit: 50,
    })
    if (refreshId !== timelineRefreshIdRef.current) return

    setTimeline(page.items)
    setNextCursor(page.nextCursor)
  }, [issue.id, organizationId])
  const refreshTimelineAfterFilesChanged = useCallback(async () => {
    await Promise.all([
      refreshTimeline(),
      queryClient.invalidateQueries({
        queryKey: issueKeys.timeline(organizationId, issue.id),
      }),
      queryClient.invalidateQueries({
        queryKey: issueKeys.lists(organizationId),
      }),
    ])
  }, [issue.id, organizationId, queryClient, refreshTimeline])
  const updateMutation = useMutation({
    mutationFn: (update: IssueUpdate) => {
      const request = updateQueueRef.current.then(() =>
        updateIssue(apiClient, { id: issue.id, organizationId, ...update })
      )
      updateQueueRef.current = request.then(
        () => undefined,
        () => undefined
      )
      return request
    },
    onMutate: (update) => {
      const fields = getIssueUpdateFields(update)
      setPendingUpdateCounts((current) => {
        const next = { ...current }
        for (const field of fields) next[field] = (next[field] ?? 0) + 1
        return next
      })
    },
    onSuccess: async (updated, update) => {
      const mergedIssue = mergeIssueUpdateResponse(
        issueRef.current,
        updated,
        update
      )
      issueRef.current = mergedIssue
      setIssue((current) => mergeIssueUpdateResponse(current, updated, update))
      await Promise.all([
        refreshTimeline(),
        queryClient.invalidateQueries({
          queryKey: issueKeys.list(organizationId),
        }),
        queryClient.invalidateQueries({
          queryKey: issueKeys.detail(organizationId, updated.id),
        }),
        queryClient.invalidateQueries({
          queryKey: issueKeys.timeline(organizationId, updated.id),
        }),
      ])
      toast.success("Issue updated")
    },
    onError: (error) => {
      showConsoleApiErrorToast(error, "Issue update failed")
    },
    onSettled: (_updated, _error, update) => {
      const fields = getIssueUpdateFields(update)
      setPendingUpdateCounts((current) => {
        const next = { ...current }
        for (const field of fields) {
          const count = (next[field] ?? 0) - 1
          if (count > 0) next[field] = count
          else delete next[field]
        }
        return next
      })
    },
  })
  const createCommentMutation = useMutation({
    mutationFn: (body: string) =>
      createIssueComment(apiClient, {
        id: issue.id,
        organizationId,
        body,
      }),
    onSuccess: async () => {
      await Promise.all([
        refreshTimeline(),
        queryClient.invalidateQueries({
          queryKey: issueKeys.comments(organizationId, issue.id),
        }),
        queryClient.invalidateQueries({
          queryKey: issueKeys.timeline(organizationId, issue.id),
        }),
        queryClient.invalidateQueries({
          queryKey: issueKeys.lists(organizationId),
        }),
      ])
      toast.success("Comment added")
    },
  })
  const updateCommentMutation = useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      updateIssueComment(apiClient, {
        id: issue.id,
        organizationId,
        commentId,
        body,
      }),
    onSuccess: async () => {
      await Promise.all([
        refreshTimeline(),
        queryClient.invalidateQueries({
          queryKey: issueKeys.comments(organizationId, issue.id),
        }),
        queryClient.invalidateQueries({
          queryKey: issueKeys.timeline(organizationId, issue.id),
        }),
      ])
    },
  })
  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) =>
      deleteIssueComment(apiClient, {
        id: issue.id,
        organizationId,
        commentId,
      }),
    onSuccess: async () => {
      await Promise.all([
        refreshTimeline(),
        queryClient.invalidateQueries({
          queryKey: issueKeys.comments(organizationId, issue.id),
        }),
        queryClient.invalidateQueries({
          queryKey: issueKeys.timeline(organizationId, issue.id),
        }),
        queryClient.invalidateQueries({
          queryKey: issueKeys.lists(organizationId),
        }),
      ])
    },
  })
  const loadOlderMutation = useMutation({
    mutationFn: (cursor: string) =>
      getIssueTimeline(apiClient, {
        id: issue.id,
        organizationId,
        cursor,
        limit: 50,
      }),
    onSuccess: (page) => {
      setTimeline((current) => [...current, ...page.items])
      setNextCursor(page.nextCursor)
    },
  })
  const { mutateAsync: updateIssueAsync } = updateMutation
  const { mutateAsync: createCommentAsync, isPending: createCommentPending } =
    createCommentMutation
  const { mutateAsync: updateCommentAsync, isPending: updateCommentPending } =
    updateCommentMutation
  const { mutateAsync: deleteCommentAsync, isPending: deleteCommentPending } =
    deleteCommentMutation
  const { mutate: loadOlderPage, isPending: loadingOlder } = loadOlderMutation

  const sortedTimeline = useMemo(() => timeline.toReversed(), [timeline])
  const pendingFields = useMemo(
    () =>
      new Set(
        issueUpdateFields.filter(
          (field) => (pendingUpdateCounts[field] ?? 0) > 0
        )
      ),
    [pendingUpdateCounts]
  )
  const handleUpdate = useCallback(
    async (_issue: IssueUiItem, update: IssueUpdate) => {
      await updateIssueAsync(update)
      return issueRef.current
    },
    [updateIssueAsync]
  )
  const handleCreateComment = useCallback(
    async (_issue: IssueUiItem, body: string) => {
      await createCommentAsync(body)
    },
    [createCommentAsync]
  )
  const handleUpdateComment = useCallback(
    async (_issue: IssueUiItem, commentId: string, body: string) => {
      await updateCommentAsync({ commentId, body })
    },
    [updateCommentAsync]
  )
  const handleDeleteComment = useCallback(
    async (_issue: IssueUiItem, commentId: string) => {
      await deleteCommentAsync(commentId)
    },
    [deleteCommentAsync]
  )
  const close = useCallback(() => {
    if (mode === "page") {
      router.push(canonicalHref.slice(0, canonicalHref.lastIndexOf("/")))
      return
    }
    router.back()
  }, [canonicalHref, mode, router])
  const loadOlder = useCallback(() => {
    if (nextCursor) loadOlderPage(nextCursor)
  }, [loadOlderPage, nextCursor])

  return (
    <IssueDetailDialog
      issue={issue}
      timeline={sortedTimeline}
      nextCursor={nextCursor}
      assignees={assignees}
      labelSuggestions={labelSuggestions}
      canonicalHref={canonicalHref}
      organizationId={organizationId}
      mode={mode}
      pending={
        pendingFields.size > 0 ||
        createCommentPending ||
        updateCommentPending ||
        deleteCommentPending
      }
      pendingFields={pendingFields}
      loadingOlder={loadingOlder}
      onLoadOlder={loadOlder}
      onUpdate={handleUpdate}
      onCreateComment={handleCreateComment}
      onUpdateComment={handleUpdateComment}
      onDeleteComment={handleDeleteComment}
      onFilesChanged={refreshTimelineAfterFilesChanged}
      onRequestClose={close}
    />
  )
}
