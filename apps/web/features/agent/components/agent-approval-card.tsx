"use client"

import {
  buildAgentAssetPreviewUrl,
  FILE_PREVIEW_WIDTHS,
} from "@enterprise-agentic-saas/api/client"
import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@enterprise-agentic-saas/ui/components/card"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { LocalDate } from "@/components/local-date"
import { decideAgentAction, resumeAgentAction } from "@/features/agent/api"
import { agentActionQueryOptions, agentKeys } from "@/features/agent/queries"
import type { AgentIssueAction } from "@/features/agent/schema"
import { issueKeys } from "@/features/issues/queries"
import { apiClient } from "@/lib/api-client"
import { clientEnv } from "@/lib/env.client"

export const AgentApprovalCard = ({
  organizationId,
  organizationSlug,
  actionId,
  frozen,
  onPendingChange,
}: {
  organizationId: string
  organizationSlug: string
  actionId: string
  frozen: boolean
  onPendingChange: (actionId: string, pending: boolean) => void
}) => {
  const queryClient = useQueryClient()
  const [executionIssue, setExecutionIssue] = useState<{
    number: number
    deleted: boolean
  }>()
  const actionQuery = useQuery(
    agentActionQueryOptions(apiClient, organizationId, actionId)
  )
  const resume = useCallback(async () => {
    const result = await resumeAgentAction(apiClient, actionId)
    setExecutionIssue({
      number: result.issue.number,
      deleted: result.issue.deleted,
    })
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: issueKeys.lists(organizationId),
      }),
      queryClient.invalidateQueries({
        queryKey: issueKeys.detail(organizationId, result.issue.id),
      }),
      queryClient.invalidateQueries({
        queryKey: issueKeys.timeline(organizationId, result.issue.id),
      }),
    ])
  }, [actionId, organizationId, queryClient])
  const decisionMutation = useMutation({
    mutationFn: async (decision: "yes" | "no") => {
      const action = await decideAgentAction(apiClient, {
        actionId,
        decision,
        idempotencyKey: crypto.randomUUID(),
      })
      if (decision === "yes" && action.status === "approved") await resume()
      return action
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: agentKeys.action(organizationId, actionId),
      })
    },
    onError: () => toast.error("The approval decision could not be completed."),
  })
  const { mutate: decide, isPending: deciding } = decisionMutation
  const resumeMutation = useMutation({
    mutationFn: resume,
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: agentKeys.action(organizationId, actionId),
      })
    },
    onError: () => toast.error("The approved action could not be resumed."),
  })
  const { mutate: resumeApproved, isPending: resuming } = resumeMutation
  const approve = useCallback(() => decide("yes"), [decide])
  const reject = useCallback(() => decide("no"), [decide])
  const retryResume = useCallback(() => resumeApproved(), [resumeApproved])
  const action = actionQuery.data
  const refetchAction = actionQuery.refetch
  const retryActionQuery = useCallback(
    () => void refetchAction(),
    [refetchAction]
  )
  useEffect(() => {
    if (action) onPendingChange(actionId, action.status === "pending")
  }, [action, actionId, onPendingChange])
  if (actionQuery.isPending) {
    return (
      <Card className="border-amber-500/50 bg-amber-500/5 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          Loading approval details…
        </div>
      </Card>
    )
  }
  if (actionQuery.isError || !action) {
    return (
      <Card className="border-destructive/50 p-4">
        <p role="alert" className="text-sm text-destructive">
          Approval details could not be loaded.
        </p>
        <Button className="mt-3" variant="outline" onClick={retryActionQuery}>
          Try again
        </Button>
      </Card>
    )
  }
  const pending = action.status === "pending"

  return (
    <Card className="border-amber-500/50 bg-amber-500/5">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Approve Issue change?</CardTitle>
          <Badge
            variant={action.preview?.destructive ? "destructive" : "outline"}
          >
            {action.kind.replace("_", " ")}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Canonical API preview · expires{" "}
          <LocalDate value={action.expiresAt} includeTime />
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="font-medium">
          {action.preview?.title ??
            (action.previewState === "expired"
              ? "Approval preview expired"
              : "Preview unavailable")}
        </p>
        {action.preview?.fields.map((field) => (
          <div
            key={field.field}
            className="grid gap-1 text-sm sm:grid-cols-[8rem_1fr]"
          >
            <span className="text-muted-foreground">{field.field}</span>
            <span>
              {formatActionValue(field.before)} →{" "}
              {formatActionValue(field.after)}
            </span>
          </div>
        ))}
        {action.preview && action.preview.attachments.length > 0 ? (
          <AgentApprovalAttachments
            organizationId={organizationId}
            attachments={action.preview.attachments}
          />
        ) : null}
        {executionIssue && !executionIssue.deleted ? (
          <Link
            href={`/organization/${organizationSlug}/issues/${executionIssue.number}`}
            className="block text-sm text-blue-600 underline underline-offset-2"
          >
            Open Issue #{executionIssue.number}
          </Link>
        ) : null}
        {pending ? (
          <div className="flex gap-2">
            <Button disabled={frozen || deciding} onClick={approve}>
              Yes
            </Button>
            <Button
              variant="outline"
              disabled={frozen || deciding}
              onClick={reject}
            >
              No
            </Button>
          </div>
        ) : action.status === "approved" ? (
          <Button disabled={frozen || resuming} onClick={retryResume}>
            Resume approved action
          </Button>
        ) : (
          <Badge variant="secondary">{action.status}</Badge>
        )}
      </CardContent>
    </Card>
  )
}

type AgentApprovalAttachment = NonNullable<
  AgentIssueAction["preview"]
>["attachments"][number]

export const AgentApprovalAttachments = ({
  organizationId,
  attachments,
}: {
  organizationId: string
  attachments: AgentApprovalAttachment[]
}) => (
  <section
    className="space-y-2 rounded-lg border bg-background/80 p-3"
    aria-label="Issue attachments awaiting approval"
  >
    <p className="text-sm font-medium">
      These images will become permanent Issue attachments if you approve this
      action.
    </p>
    <p className="text-xs text-muted-foreground">
      They will remain with the Issue after the temporary chat-image retention
      period ends.
    </p>
    <div className="grid gap-3 sm:grid-cols-2">
      {attachments.map((attachment) => (
        <figure
          key={attachment.assetId}
          className="overflow-hidden rounded-md border bg-muted/30"
        >
          {/* This authenticated private image must bypass the Next optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="max-h-64 w-full object-contain"
            src={buildAgentAssetPreviewUrl(clientEnv.NEXT_PUBLIC_API_BASE_URL, {
              organizationId,
              assetId: attachment.assetId,
              width: FILE_PREVIEW_WIDTHS[1],
            })}
            alt={`Attachment preview: ${attachment.filename}`}
            loading="lazy"
          />
          <figcaption className="border-t px-2 py-1.5 text-xs">
            <span className="block truncate">{attachment.filename}</span>
            <span className="text-muted-foreground">
              {Math.ceil(attachment.sizeBytes / 1024)} KB
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  </section>
)

const formatActionValue = (
  value: AgentIssueAction["preview"] extends infer Preview
    ? Preview extends { fields: Array<infer Field> }
      ? Field extends { before: infer Value }
        ? Value
        : never
      : never
    : never
) => (Array.isArray(value) ? value.join(", ") : (value ?? "—"))
