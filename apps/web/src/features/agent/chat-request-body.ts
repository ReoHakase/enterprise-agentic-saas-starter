import { getToolName, isToolUIPart } from "ai"
import * as v from "valibot"

import type { AgentChatMessage } from "./schema"

type AgentContextReference =
  | {
      kind: "issue" | "file" | "member"
      id: string
    }
  | { kind: "current_page"; path: string }

type AgentContentSegment =
  | { type: "text"; text: string }
  | { type: "context_reference"; reference: AgentContextReference }

type PrepareAgentChatBodyInput = {
  threadId: string
  messages: AgentChatMessage[]
  timezone: string
}

const identifier = v.pipe(v.string(), v.minLength(1), v.maxLength(128))
const issueQueryOutputSchema = v.strictObject({
  q: v.pipe(v.string(), v.maxLength(200)),
  status: v.picklist(["all", "open", "in_progress", "closed"]),
  priority: v.picklist([
    "all",
    "no_priority",
    "low",
    "medium",
    "high",
    "urgent",
  ]),
  assignee: v.pipe(v.string(), v.maxLength(128)),
  label: v.pipe(v.string(), v.maxLength(40)),
  sort: v.picklist([
    "number",
    "createdAt",
    "updatedAt",
    "dueDate",
    "priority",
    "status",
  ]),
  dir: v.picklist(["asc", "desc"]),
  page: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100_000)),
})
const formSnapshotOutputSchema = v.strictObject({
  formId: identifier,
  resource: v.literal("issue"),
  resourceId: v.optional(identifier),
  revision: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  epoch: identifier,
  values: v.strictObject({
    title: v.optional(v.pipe(v.string(), v.maxLength(200))),
    description: v.optional(v.pipe(v.string(), v.maxLength(10_000))),
  }),
  dirtyFields: v.pipe(
    v.array(v.picklist(["title", "description"])),
    v.maxLength(2),
    v.check((items) => new Set(items).size === items.length)
  ),
})
const okOutputSchema = v.strictObject({ ok: v.literal(true) })
const queryOutputSchema = v.strictObject({
  ok: v.literal(true),
  query: issueQueryOutputSchema,
})

const clientToolNames = [
  "ui_navigate",
  "ui_open_issue",
  "ui_set_issue_query",
  "ui_read_form_draft",
  "ui_patch_form_draft",
] as const
type ClientToolName = (typeof clientToolNames)[number]

const isClientToolName = (value: string): value is ClientToolName =>
  clientToolNames.some((name) => name === value)

const parseClientToolOutput = (toolName: ClientToolName, output: unknown) => {
  if (toolName === "ui_navigate" || toolName === "ui_open_issue") {
    return v.parse(okOutputSchema, output)
  }
  if (toolName === "ui_set_issue_query") {
    return v.parse(queryOutputSchema, output)
  }
  return v.parse(formSnapshotOutputSchema, output)
}

const validateAssetIds = (value: unknown): string[] => {
  if (
    !Array.isArray(value) ||
    value.length > 4 ||
    !value.every(
      (item): item is string =>
        typeof item === "string" && item.length > 0 && item.length <= 128
    ) ||
    new Set(value).size !== value.length
  ) {
    throw new Error("Invalid Agent asset submission.")
  }
  return value
}

const prepareUserMessageBody = (
  threadId: string,
  message: AgentChatMessage,
  timezone: string
) => {
  const assetParts = message.parts.filter(
    (part) => part.type === "data-agent-assets"
  )
  if (assetParts.length > 1) {
    throw new Error("Invalid Agent message submission.")
  }
  const assetIds = validateAssetIds(assetParts[0]?.data.assetIds ?? [])
  const contentSegments: AgentContentSegment[] = []
  for (const part of message.parts) {
    if (part.type === "text") {
      contentSegments.push({ type: "text", text: part.text })
      continue
    }
    if (part.type !== "data-context-reference") continue
    const reference: AgentContextReference =
      part.data.kind === "current_page"
        ? { kind: "current_page", path: part.data.path }
        : { kind: part.data.kind, id: part.data.id }
    contentSegments.push({ type: "context_reference", reference })
  }
  if (contentSegments.length === 0 && assetIds.length === 0) {
    throw new Error("Invalid Agent message submission.")
  }

  return {
    threadId,
    messageId: message.id,
    contentSegments,
    assetIds,
    timezone,
  }
}

const prepareClientToolContinuationBody = (
  threadId: string,
  message: AgentChatMessage,
  timezone: string
) => {
  const lastStepStart = message.parts.reduce(
    (lastIndex, part, index) =>
      part.type === "step-start" ? index : lastIndex,
    -1
  )
  const clientToolParts = message.parts
    .slice(lastStepStart + 1)
    .filter(isToolUIPart)
    .map((part) => ({ part, toolName: getToolName(part) }))
    .filter((entry): entry is typeof entry & { toolName: ClientToolName } =>
      isClientToolName(entry.toolName)
    )

  if (
    clientToolParts.length === 0 ||
    clientToolParts.length > 4 ||
    new Set(clientToolParts.map(({ part }) => part.toolCallId)).size !==
      clientToolParts.length
  ) {
    throw new Error("Invalid Agent client tool continuation.")
  }

  const clientToolResults = clientToolParts.map(({ part, toolName }) => {
    if (part.state === "output-available") {
      return {
        toolCallId: v.parse(identifier, part.toolCallId),
        toolName,
        state: "output-available" as const,
        output: parseClientToolOutput(toolName, part.output),
      }
    }
    if (part.state === "output-error") {
      const errorText = v.parse(
        v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
        part.errorText
      )
      return {
        toolCallId: v.parse(identifier, part.toolCallId),
        toolName,
        state: "output-error" as const,
        errorText,
      }
    }
    throw new Error("Agent client tool output is incomplete.")
  })

  return {
    threadId,
    assistantMessageId: message.id,
    clientToolResults,
    timezone,
  }
}

export const prepareAgentChatBody = ({
  threadId,
  messages,
  timezone,
}: PrepareAgentChatBodyInput) => {
  const message = messages.at(-1)
  if (!message || timezone.length === 0 || timezone.length > 64) {
    throw new Error("Invalid Agent message submission.")
  }
  if (message.role === "user") {
    return prepareUserMessageBody(threadId, message, timezone)
  }
  if (message.role === "assistant") {
    return prepareClientToolContinuationBody(threadId, message, timezone)
  }
  throw new Error("Invalid Agent message submission.")
}
