"use client"

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@enterprise-agentic-saas/ui/components/ai-elements/conversation"
import { isToolUIPart } from "ai"
import type { ReactNode } from "react"

import type { AgentChatMessage } from "../../schema"
import { AgentConversationMinimap } from "./agent-conversation-minimap"

const turnPreviewTextLimit = 180
const responsePreviewTextLimit = 240
const emptyTurns: AgentConversationTurnPreview[] = []

export type AgentConversationTurnPreview = {
  id: string
  prompt: string
  response?: string
  imageCount: number
  contextCount: number
  toolCount: number
}

export type AgentConversationGroup = {
  id: string
  messages: AgentChatMessage[]
  turn?: AgentConversationTurnPreview
}

const normalizePreviewText = (value: string, limit: number) => {
  const normalized = value.replace(/\s+/gu, " ").trim()
  return normalized.length <= limit
    ? normalized
    : `${normalized.slice(0, limit - 1).trimEnd()}…`
}

const userMessagePreview = (message: AgentChatMessage) => {
  const text = message.parts
    .flatMap((part) => {
      if (part.type === "text") return [part.text]
      if (part.type === "data-context-reference") return [`@${part.data.label}`]
      return []
    })
    .join(" ")
  const imageCount = message.parts.reduce(
    (count, part) =>
      part.type === "data-agent-assets"
        ? count + part.data.assetIds.length
        : count,
    0
  )
  return {
    contextCount: message.parts.filter(
      (part) => part.type === "data-context-reference"
    ).length,
    imageCount,
    prompt:
      normalizePreviewText(text, turnPreviewTextLimit) ||
      (imageCount > 0 ? "Image request" : "Agent request"),
  }
}

const updateTurnPreview = (group: AgentConversationGroup) => {
  if (!group.turn) return
  const assistantMessages = group.messages.filter(
    (message) => message.role === "assistant"
  )
  const response = normalizePreviewText(
    assistantMessages
      .flatMap((message) =>
        message.parts.flatMap((part) =>
          part.type === "text" ? [part.text] : []
        )
      )
      .join(" "),
    responsePreviewTextLimit
  )
  group.turn.response = response || undefined
  group.turn.toolCount = assistantMessages.reduce(
    (count, message) =>
      count + message.parts.filter((part) => isToolUIPart(part)).length,
    0
  )
}

export const buildAgentConversationGroups = (
  messages: AgentChatMessage[]
): AgentConversationGroup[] => {
  const groups: AgentConversationGroup[] = []
  for (const message of messages) {
    if (message.role === "user") {
      const preview = userMessagePreview(message)
      groups.push({
        id: message.id,
        messages: [message],
        turn: { id: message.id, ...preview, toolCount: 0 },
      })
      continue
    }
    const current = groups.at(-1)
    if (!current) {
      groups.push({ id: `leading:${message.id}`, messages: [message] })
      continue
    }
    current.messages.push(message)
    updateTurnPreview(current)
  }
  return groups
}

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
