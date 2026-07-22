"use client"

import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { XIcon } from "lucide-react"
import { useCallback } from "react"

import type { AgentContextReference } from "../chat-transport"

export const AgentContextChip = ({
  reference,
  onRemove,
}: {
  reference: AgentContextReference
  onRemove: (reference: AgentContextReference) => void
}) => {
  const remove = useCallback(() => onRemove(reference), [onRemove, reference])
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 py-1 pr-1 pl-2 text-xs text-blue-700 dark:text-blue-300">
      <span className="truncate">{reference.label}</span>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label={`Remove ${reference.label}`}
        onClick={remove}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </span>
  )
}

export const AgentMentionCandidate = ({
  candidate,
  onSelect,
}: {
  candidate: AgentContextReference
  onSelect: (candidate: AgentContextReference) => void
}) => {
  const select = useCallback(() => onSelect(candidate), [candidate, onSelect])
  return (
    <Button
      type="button"
      variant="ghost"
      className="w-full justify-start text-left"
      onClick={select}
    >
      <span className="truncate">{candidate.label}</span>
      <Badge variant="outline" className="ml-auto">
        {candidate.kind.replace("_", " ")}
      </Badge>
    </Button>
  )
}
