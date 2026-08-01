import {
  addAttachmentWriteToolProviderOutputSchema,
  addIssueAttachmentsToolInputSchema,
  agentGetIssueToolOutputSchema,
  agentUiMessagePartSchema,
  agentUiToolNames,
  canonicalizePublicHttpUrl,
  createIssueToolInputSchema,
  deleteIssueToolInputSchema,
  emptyToolInputSchema,
  getIssueToolInputSchema,
  issueSearchToolInputSchema,
  issueSearchToolOutputSchema,
  issueWriteToolProviderOutputSchema,
  labelSearchToolInputSchema,
  labelSearchToolOutputSchema,
  memberSearchToolInputSchema,
  memberSearchToolOutputSchema,
  readAccountContextToolOutputSchema,
  readActiveOrganizationToolOutputSchema,
  readIssueAttachmentImageToolInputSchema,
  readIssueAttachmentImageToolResultSchema,
  removeAttachmentWriteToolProviderOutputSchema,
  removeIssueAttachmentsToolInputSchema,
  updateIssueToolInputSchema,
} from "@enterprise-agentic-saas/agent-contracts"
import type {
  MastraDBMessage,
  MastraMessagePart,
  MastraToolInvocation,
} from "@mastra/core/agent/message-list"
import type { OutputProcessor } from "@mastra/core/processors"
import * as v from "valibot"

import {
  agentClientToolOutputValueSchemas,
  agentClientToolValueSchemas,
} from "../../tools/client/schema"
import { publicWebSearchInputValueSchema } from "../../tools/web-search/schema"
import { projectOpenRouterReasoningOptions } from "./reasoning-details"

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u
const TOOL_STATES: readonly MastraToolInvocation["state"][] = [
  "partial-call",
  "call",
  "result",
  "approval-requested",
  "approval-responded",
  "output-error",
  "output-denied",
]
const isToolState = (value: string): value is MastraToolInvocation["state"] =>
  TOOL_STATES.some((state) => state === value)
const TOOL_NAMES = new Set<string>(agentUiToolNames)
const webSearchOutputSchema = v.strictObject({
  content: v.pipe(v.string(), v.maxLength(6_000)),
  sources: v.pipe(
    v.array(
      v.strictObject({
        title: v.pipe(v.string(), v.maxLength(200)),
        url: v.pipe(v.string(), v.url(), v.maxLength(2_048)),
      })
    ),
    v.maxLength(5)
  ),
  trust: v.literal("untrusted_public_web_content"),
})

type ToolContract = {
  input: v.GenericSchema
  output?: v.GenericSchema
  projectOutput?: (output: unknown, input: unknown) => unknown
  publicOutputUrls?: boolean
}
const toolContract = (
  input: v.GenericSchema,
  output?: v.GenericSchema
): ToolContract => ({ input, output })

const productSkillNameSchema = v.picklist([
  "core",
  "issue-triage",
  "issue-writing",
  "web-assistance",
])
const skillToolInputSchema = v.strictObject({ name: productSkillNameSchema })
const skillToolOutputSchema = v.union([
  v.pipe(v.string(), v.maxLength(50_000)),
  v.strictObject({
    activated: v.literal(true),
    name: productSkillNameSchema,
  }),
])

const TOOL_CONTRACTS: Record<string, ToolContract> = {
  add_issue_attachments: toolContract(
    addIssueAttachmentsToolInputSchema,
    addAttachmentWriteToolProviderOutputSchema
  ),
  create_issue: toolContract(
    createIssueToolInputSchema,
    issueWriteToolProviderOutputSchema
  ),
  delete_issue: toolContract(
    deleteIssueToolInputSchema,
    issueWriteToolProviderOutputSchema
  ),
  get_issue: toolContract(
    getIssueToolInputSchema,
    agentGetIssueToolOutputSchema
  ),
  read_account_context: toolContract(
    emptyToolInputSchema,
    readAccountContextToolOutputSchema
  ),
  read_active_organization: toolContract(
    emptyToolInputSchema,
    readActiveOrganizationToolOutputSchema
  ),
  read_issue_attachment_image: toolContract(
    readIssueAttachmentImageToolInputSchema,
    readIssueAttachmentImageToolResultSchema
  ),
  remove_issue_attachments: toolContract(
    removeIssueAttachmentsToolInputSchema,
    removeAttachmentWriteToolProviderOutputSchema
  ),
  search_issue_labels: toolContract(
    labelSearchToolInputSchema,
    labelSearchToolOutputSchema
  ),
  search_issues: toolContract(
    issueSearchToolInputSchema,
    issueSearchToolOutputSchema
  ),
  search_organization_members: toolContract(
    memberSearchToolInputSchema,
    memberSearchToolOutputSchema
  ),
  skill: {
    input: skillToolInputSchema,
    output: skillToolOutputSchema,
    projectOutput: (_output, input) => {
      const parsed = v.safeParse(skillToolInputSchema, input)
      return parsed.success
        ? { activated: true, name: parsed.output.name }
        : undefined
    },
  },
  ui_navigate: toolContract(
    agentClientToolValueSchemas.navigate,
    agentClientToolOutputValueSchemas.navigate
  ),
  ui_open_issue: toolContract(
    agentClientToolValueSchemas.openIssue,
    agentClientToolOutputValueSchemas.openIssue
  ),
  ui_patch_form_draft: toolContract(
    agentClientToolValueSchemas.patchFormDraft,
    agentClientToolOutputValueSchemas.patchFormDraft
  ),
  ui_read_form_draft: toolContract(
    agentClientToolValueSchemas.readFormDraft,
    agentClientToolOutputValueSchemas.readFormDraft
  ),
  ui_set_issue_query: toolContract(
    agentClientToolValueSchemas.setIssueQuery,
    agentClientToolOutputValueSchemas.setIssueQuery
  ),
  update_issue: toolContract(
    updateIssueToolInputSchema,
    issueWriteToolProviderOutputSchema
  ),
  web_search: {
    input: publicWebSearchInputValueSchema,
    output: webSearchOutputSchema,
    publicOutputUrls: true,
  },
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const optionalBoundedString = (value: unknown, maximum: number) =>
  typeof value === "string" && value.length <= maximum ? value : undefined

const canonicalPublicUrl = (value: unknown) => {
  const canonical = canonicalizePublicHttpUrl(value)
  return canonical ?? undefined
}

const projectParsedValue = (
  value: unknown,
  allowPublicUrls: boolean
): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => projectParsedValue(item, allowPublicUrls))
  }
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, nested]) => {
      const normalized = key.toLowerCase()
      if (
        normalized === "profileimage" ||
        normalized.includes("metadata") ||
        normalized === "rawinput"
      ) {
        return []
      }
      if (
        normalized === "href" ||
        normalized === "endpoint" ||
        normalized === "origin" ||
        normalized.endsWith("url")
      ) {
        const url = allowPublicUrls ? canonicalPublicUrl(nested) : undefined
        return url ? [[key, url]] : []
      }
      return [[key, projectParsedValue(nested, allowPublicUrls)]]
    })
  )
}

const parseToolValue = (
  schema: v.GenericSchema | undefined,
  value: unknown,
  allowPublicUrls = false
) => {
  if (!schema) return
  const parsed = v.safeParse(schema, value)
  if (!parsed.success) return
  const projected = projectParsedValue(parsed.output, allowPublicUrls)
  const validated = v.safeParse(schema, projected)
  return validated.success ? validated.output : undefined
}

const projectApproval = (value: unknown) => {
  if (!isRecord(value) || !IDENTIFIER_PATTERN.test(String(value.id))) return
  if (value.approved !== undefined && typeof value.approved !== "boolean")
    return
  const reason = optionalBoundedString(value.reason, 500)
  const safeReason =
    reason &&
    !/(?:https?:\/\/|authorization|bearer|password|secret|token|api[_ -]?key)/iu.test(
      reason
    )
      ? reason
      : undefined
  return {
    id: String(value.id),
    approved: value.approved,
    reason: safeReason,
  }
}

const hasValidToolStatePayload = (input: {
  approval: ReturnType<typeof projectApproval>
  args: unknown
  result: unknown
  state: string
}) => {
  const hasInput = input.args !== undefined
  const hasResult = input.result !== undefined
  const terminalApprovalIsValid =
    input.approval === undefined || input.approval.approved === true
  switch (input.state) {
    case "partial-call":
    case "call":
      return hasInput && !hasResult && input.approval === undefined
    case "result":
      return hasInput && hasResult && terminalApprovalIsValid
    case "approval-requested":
      return (
        hasInput &&
        !hasResult &&
        input.approval !== undefined &&
        input.approval.approved === undefined &&
        input.approval.reason === undefined
      )
    case "approval-responded":
      return (
        hasInput && !hasResult && typeof input.approval?.approved === "boolean"
      )
    case "output-denied":
      return hasInput && !hasResult && input.approval?.approved === false
    case "output-error":
      return hasInput && !hasResult && terminalApprovalIsValid
    default:
      return false
  }
}

const projectToolPartFields = (part: Record<string, unknown>) => {
  const providerMetadata = projectOpenRouterReasoningOptions(
    part.providerOptions,
    part.providerMetadata
  )
  return {
    title: optionalBoundedString(part.title, 200),
    ...(providerMetadata ? { providerMetadata } : {}),
  }
}

const projectToolInvocation = (
  part: Record<string, unknown>
): MastraMessagePart | undefined => {
  if (!isRecord(part.toolInvocation)) return
  const invocation = part.toolInvocation
  const toolName = optionalBoundedString(invocation.toolName, 128)
  const toolCallId = optionalBoundedString(invocation.toolCallId, 128)
  const state = optionalBoundedString(invocation.state, 64)
  if (
    !toolName ||
    !TOOL_NAMES.has(toolName) ||
    !toolCallId ||
    !IDENTIFIER_PATTERN.test(toolCallId) ||
    !state ||
    !isToolState(state)
  ) {
    return
  }
  const contract = TOOL_CONTRACTS[toolName]
  if (!contract) return
  const args = parseToolValue(contract.input, invocation.args)
  const parsedResult = parseToolValue(
    contract.output,
    invocation.result,
    contract.publicOutputUrls
  )
  const result =
    parsedResult === undefined
      ? undefined
      : contract.projectOutput
        ? contract.projectOutput(parsedResult, args)
        : parsedResult
  const approval = projectApproval(invocation.approval)
  const step =
    typeof invocation.step === "number" &&
    Number.isInteger(invocation.step) &&
    invocation.step >= 0
      ? invocation.step
      : undefined
  if (!hasValidToolStatePayload({ approval, args, result, state })) return
  return {
    type: "tool-invocation",
    toolInvocation: {
      state,
      toolCallId,
      toolName,
      args,
      result,
      approval,
      step,
      errorText:
        state === "output-error" ? "Agent tool execution failed." : undefined,
    },
    ...projectToolPartFields(part),
  }
}

const projectSource = (
  part: Record<string, unknown>
): MastraMessagePart | undefined => {
  const source = isRecord(part.source) ? part.source : part
  const url = canonicalPublicUrl(source.url)
  if (!url) return
  const title = optionalBoundedString(source.title ?? part.title, 500)
  if (part.type === "source-url") {
    const sourceId = optionalBoundedString(part.sourceId, 128)
    if (!sourceId || !IDENTIFIER_PATTERN.test(sourceId)) return
    return {
      type: "source",
      source: { sourceType: "url", id: sourceId, title, url },
    }
  }
  const id = optionalBoundedString(source.id, 128)
  if (!id || !IDENTIFIER_PATTERN.test(id)) return
  return {
    type: "source",
    source: { sourceType: "url", id, title, url },
  }
}

const projectPart = (value: unknown): MastraMessagePart | undefined => {
  if (!isRecord(value) || typeof value.type !== "string") return
  if (value.type === "text") {
    return {
      type: "text",
      text: optionalBoundedString(value.text, 50_000) ?? "",
    }
  }
  if (value.type === "reasoning") {
    const text = optionalBoundedString(value.text ?? value.reasoning, 50_000)
    const providerMetadata = projectOpenRouterReasoningOptions(
      value.providerOptions,
      value.providerMetadata
    )
    if (text === undefined && !providerMetadata) return
    return {
      type: "reasoning",
      reasoning: text ?? "",
      details: [],
      ...(providerMetadata ? { providerMetadata } : {}),
    }
  }
  if (value.type === "source" || value.type === "source-url") {
    return projectSource(value)
  }
  if (value.type === "tool-invocation") {
    return projectToolInvocation(value)
  }
  if (
    value.type === "data-agent-assets" ||
    value.type === "data-context-reference"
  ) {
    const parsed = v.safeParse(
      agentUiMessagePartSchema,
      Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== "createdAt")
      )
    )
    return parsed.success &&
      (parsed.output.type === "data-agent-assets" ||
        parsed.output.type === "data-context-reference")
      ? parsed.output
      : undefined
  }
  if (value.type === "step-start") return { type: "step-start" }
}

const stableSourceId = (toolCallId: string, index: number, url: string) => {
  let hash = 2_166_136_261
  for (const character of `${toolCallId}\0${url}`) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16_777_619)
  }
  return `source_${index}_${toolCallId.slice(0, 96)}_${(hash >>> 0)
    .toString(16)
    .padStart(8, "0")}`
}

const projectToolSources = (
  part: ReturnType<typeof projectPart>
): MastraMessagePart[] => {
  if (!isRecord(part) || part.type !== "tool-invocation") return []
  const invocation = Reflect.get(part, "toolInvocation")
  if (
    !isRecord(invocation) ||
    invocation.toolName !== "web_search" ||
    invocation.state !== "result" ||
    typeof invocation.toolCallId !== "string" ||
    !isRecord(invocation.result) ||
    !Array.isArray(invocation.result.sources)
  ) {
    return []
  }
  const toolCallId = invocation.toolCallId
  return invocation.result.sources.flatMap((value, index) => {
    if (!isRecord(value)) return []
    const title = optionalBoundedString(value.title, 200)
    const url = canonicalPublicUrl(value.url)
    if (!title || !url) return []
    return [
      {
        type: "source",
        source: {
          sourceType: "url",
          id: stableSourceId(toolCallId, index, url),
          title,
          url,
        },
      },
    ]
  })
}

const projectMessageParts = (
  parts: readonly unknown[]
): MastraMessagePart[] => {
  const projected = parts.flatMap((value) => {
    const part = projectPart(value)
    if (!part) return []
    return [part, ...projectToolSources(part)]
  })
  const sourceUrls = new Set<string>()
  return projected.filter((part) => {
    if (!isRecord(part)) return true
    const nestedSource = Reflect.get(part, "source")
    const source = isRecord(nestedSource) ? nestedSource : part
    const sourceUrl = Reflect.get(source, "url")
    if (part.type !== "source") return true
    if (typeof sourceUrl !== "string" || sourceUrls.has(sourceUrl)) {
      return false
    }
    sourceUrls.add(sourceUrl)
    return true
  })
}

const projectMemorySnapshotMessages = (
  messages: readonly MastraDBMessage[]
): MastraDBMessage[] =>
  messages.map((message) => ({
    id: message.id,
    role: message.role,
    createdAt: message.createdAt,
    threadId: message.threadId,
    resourceId: message.resourceId,
    content: {
      format: 2,
      parts: projectMessageParts(message.content.parts),
    },
  }))

export const productMemoryOutputProcessor = {
  id: "product-memory-security-projection",
  processOutputResult: ({ messages }: { messages: MastraDBMessage[] }) =>
    projectMemorySnapshotMessages(messages),
} satisfies OutputProcessor
