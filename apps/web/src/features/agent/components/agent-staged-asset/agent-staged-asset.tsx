"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { XIcon } from "lucide-react"
import { useCallback } from "react"
import { toast } from "sonner"

import { reportObservedError } from "@/lib/report-observed-error"

import type { StagedAgentAsset } from "../runtime-state/runtime-state"

export const AgentStagedAsset = ({
  item,
  disabled,
  onRemove,
}: {
  item: StagedAgentAsset
  disabled: boolean
  onRemove: (assetId: string) => Promise<void>
}) => {
  const remove = useCallback(
    () =>
      void onRemove(item.asset.id).catch((error: unknown) => {
        reportObservedError(error, { operation: "agent.asset.remove" })
        toast.error("The staged image could not be deleted from storage.")
      }),
    [item.asset.id, onRemove]
  )
  return (
    <div className="relative overflow-hidden rounded-xl border">
      {/* Local Blob URL is ephemeral and revoked after send/remove/switch. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="size-20 object-cover"
        src={item.blobUrl}
        alt={item.asset.filename}
      />
      <Button
        className="absolute top-1 right-1"
        size="icon-xs"
        variant="secondary"
        aria-label={`Remove ${item.asset.filename}`}
        disabled={disabled}
        onClick={remove}
      >
        <XIcon />
      </Button>
    </div>
  )
}
