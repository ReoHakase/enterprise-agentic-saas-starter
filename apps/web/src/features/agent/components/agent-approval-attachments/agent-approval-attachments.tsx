"use client"

import {
  buildAgentAssetPreviewUrl,
  FILE_PREVIEW_WIDTHS,
} from "@enterprise-agentic-saas/api/client"

import { clientEnv } from "@/lib/env.client"

import type { AgentIssueAction } from "../../schema"

type AgentApprovalAttachment = NonNullable<
  AgentIssueAction["preview"]
>["attachments"][number]

export const AgentApprovalAttachments = ({
  organizationId,
  attachments,
}: {
  organizationId: string
  attachments: AgentApprovalAttachment[]
}) => {
  const removing = attachments.some(
    (attachment) => attachment.source === "file"
  )
  return (
    <section
      className="space-y-2 rounded-lg border bg-background/80 p-3"
      aria-label="Issue attachments awaiting approval"
    >
      <p className="text-sm font-medium">
        {removing
          ? "These Issue attachments will be removed if you approve this action."
          : "These images will become permanent Issue attachments if you approve this action."}
      </p>
      {!removing ? (
        <p className="text-xs text-muted-foreground">
          They will remain with the Issue after the temporary chat-image
          retention period ends.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {attachments.map((attachment) => (
          <figure
            key={
              attachment.source === "asset"
                ? attachment.assetId
                : attachment.fileId
            }
            className="overflow-hidden rounded-md border bg-muted/30"
          >
            {attachment.source === "asset" ? (
              // This authenticated private image must bypass the Next optimizer.
              // oxlint-disable react-doctor/nextjs-no-img-element
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="max-h-64 w-full object-contain"
                src={buildAgentAssetPreviewUrl(
                  clientEnv.NEXT_PUBLIC_API_BASE_URL,
                  {
                    organizationId,
                    assetId: attachment.assetId,
                    width: FILE_PREVIEW_WIDTHS[1],
                  }
                )}
                alt={`Attachment preview: ${attachment.filename}`}
                loading="lazy"
              />
            ) : // oxlint-enable react-doctor/nextjs-no-img-element
            null}
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
}
