"use client"

import {
  Tool,
  ToolContent,
  ToolHeader,
} from "@enterprise-agentic-saas/ui/components/ai-elements/tool"
import { getToolName, type DynamicToolUIPart, type ToolUIPart } from "ai"
import Link from "next/link"
import { useEffect, useState } from "react"
import * as v from "valibot"

import { withAgentThreadHref } from "@/features/issues"

import {
  attachmentMutationToolReceiptSchema,
  pendingActionToolOutputSchema,
} from "../../schema"
import { AgentApprovalCard } from "../agent-approval-card/agent-approval-card"
import { issueLinksFromToolOutput } from "../issue-links-from-tool-output/issue-links-from-tool-output"
import { webSearchLinksFromToolOutput } from "../web-search-links/web-search-links"
import { toolPresentation } from "./tool-presentation"

export const AgentToolPart = ({
  canonicalSourceUrls,
  frozen,
  organizationId,
  organizationSlug,
  threadId,
  part,
  onPendingChange,
}: {
  canonicalSourceUrls: ReadonlySet<string>
  frozen: boolean
  organizationId: string
  organizationSlug: string
  threadId: string
  part: DynamicToolUIPart | ToolUIPart
  onPendingChange: (actionId: string, pending: boolean) => void
}) => {
  const toolName = getToolName(part)
  const displayState =
    part.state === "approval-responded" && part.approval.approved === false
      ? "output-denied"
      : part.state
  const pendingAction =
    part.state === "output-available"
      ? v.safeParse(pendingActionToolOutputSchema, part.output)
      : null
  const issueLinks =
    part.state === "output-available"
      ? issueLinksFromToolOutput(toolName, part.output)
      : []
  const presentation = toolPresentation({
    issueCount: issueLinks.length,
    issueNumber: issueLinks[0]?.number,
    input: "input" in part ? part.input : undefined,
    output: "output" in part ? part.output : undefined,
    state: displayState,
    toolName,
  })
  const webSearchLinks =
    part.state === "output-available"
      ? webSearchLinksFromToolOutput(toolName, part.output).filter(
          (source) => !canonicalSourceUrls.has(source.url)
        )
      : []
  const attachmentReceipt =
    part.state === "output-available"
      ? v.safeParse(attachmentMutationToolReceiptSchema, part.output)
      : null
  const hasSafeDetails =
    Boolean(presentation.request) ||
    Boolean(presentation.result) ||
    issueLinks.length > 0 ||
    Boolean(attachmentReceipt?.success) ||
    webSearchLinks.length > 0
  const [open, setOpen] = useState(hasSafeDetails)
  useEffect(() => {
    // Tool output can arrive after the initial render and should open the details panel.
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    if (hasSafeDetails) setOpen(true)
  }, [hasSafeDetails])

  if (pendingAction?.success)
    return (
      <AgentApprovalCard
        actionId={pendingAction.output.actionId}
        organizationId={organizationId}
        organizationSlug={organizationSlug}
        frozen={frozen}
        onPendingChange={onPendingChange}
      />
    )

  return (
    <Tool
      aria-label={presentation.title}
      open={open}
      onOpenChange={setOpen}
      role={displayState === "output-error" ? "alert" : "status"}
    >
      <ToolHeader state={displayState} title={presentation.title} />
      {hasSafeDetails ? (
        <ToolContent>
          {presentation.request ? (
            <p className="text-xs text-muted-foreground">
              {presentation.request}
            </p>
          ) : null}
          {presentation.result ? (
            <p className="text-xs font-medium">{presentation.result}</p>
          ) : null}
          {issueLinks.length > 0 ? (
            <div className="space-y-1">
              {issueLinks.map((issue) => (
                <Link
                  key={issue.number}
                  href={withAgentThreadHref(
                    `/organization/${organizationSlug}/issues/${issue.number}`,
                    threadId
                  )}
                  className="block text-blue-600 underline underline-offset-2"
                >
                  #{issue.number} {issue.title}
                </Link>
              ))}
            </div>
          ) : null}
          {attachmentReceipt?.success ? (
            <p role="status">
              {attachmentReceipt.output.operation === "added"
                ? "Added"
                : "Removed"}{" "}
              {attachmentReceipt.output.fileIds.length} attachment
              {attachmentReceipt.output.fileIds.length === 1 ? "" : "s"} on{" "}
              <Link
                href={withAgentThreadHref(
                  `/organization/${organizationSlug}/issues/${attachmentReceipt.output.issueNumber}`,
                  threadId
                )}
                className="text-blue-600 underline underline-offset-2"
              >
                Issue #{attachmentReceipt.output.issueNumber}
              </Link>{" "}
              at revision {attachmentReceipt.output.revision}.
            </p>
          ) : null}
          {webSearchLinks.length > 0 ? (
            <div className="space-y-1">
              {webSearchLinks.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-blue-600 underline underline-offset-2"
                >
                  {source.title}
                </a>
              ))}
            </div>
          ) : null}
        </ToolContent>
      ) : null}
    </Tool>
  )
}
