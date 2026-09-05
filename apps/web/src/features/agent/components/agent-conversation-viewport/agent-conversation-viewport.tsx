"use client"

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@enterprise-agentic-saas/ui/components/ai-elements/conversation"
import type { ReactNode } from "react"

import type { AgentConversationTurnPreview } from "./agent-conversation-groups"
import { AgentConversationMinimap } from "./agent-conversation-minimap"

const emptyTurns: AgentConversationTurnPreview[] = []

export const AgentConversationViewport = ({
  children,
  enabled,
  turns = emptyTurns,
}: {
  children: ReactNode
  enabled: boolean
  turns?: AgentConversationTurnPreview[]
}) =>
  enabled ? (
    <Conversation
      aria-label="Agent conversation"
      data-testid="agent-conversation-viewport"
    >
      <ConversationContent data-testid="agent-conversation-content">
        {children}
      </ConversationContent>
      <ConversationScrollButton />
      {turns.length >= 2 ? <AgentConversationMinimap turns={turns} /> : null}
    </Conversation>
  ) : (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-6"
      data-testid="agent-conversation-viewport"
    >
      {children}
    </div>
  )
