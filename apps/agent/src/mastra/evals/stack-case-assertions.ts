import { canonicalizePublicHttpUrl } from "@enterprise-agentic-saas/agent-contracts"

import type { AgentEvalCase } from "./dataset"
import type {
  AgentEvalStack,
  AgentEvalStackUsageSnapshot,
} from "./stack-process"

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

export const toolNames = (events: readonly unknown[]) =>
  events.flatMap((event) =>
    isRecord(event) &&
    event.type === "tool-input-available" &&
    typeof event.toolName === "string"
      ? [event.toolName]
      : []
  )

const toolInput = (events: readonly unknown[], toolName: string) =>
  events.find(
    (event) =>
      isRecord(event) &&
      event.type === "tool-input-available" &&
      event.toolName === toolName
  )

const toolOutput = (events: readonly unknown[], toolName: string) => {
  const toolCallIds = new Set(
    events.flatMap((event) =>
      isRecord(event) &&
      event.type === "tool-input-available" &&
      event.toolName === toolName &&
      typeof event.toolCallId === "string"
        ? [event.toolCallId]
        : []
    )
  )
  return events.findLast(
    (event) =>
      isRecord(event) &&
      (event.type === "tool-output-available" ||
        event.type === "tool-output-error") &&
      (event.toolName === toolName ||
        (typeof event.toolCallId === "string" &&
          toolCallIds.has(event.toolCallId)))
  )
}

export const assistantText = (events: readonly unknown[]) =>
  events
    .flatMap((event) => {
      if (!isRecord(event) || event.type !== "text-delta") return []
      if (typeof event.delta === "string") return [event.delta]
      return typeof event.text === "string" ? [event.text] : []
    })
    .join("")

export const assertWebSearchEvidence = (events: readonly unknown[]) => {
  const output = toolOutput(events, "web_search")
  if (!isRecord(output)) {
    throw new Error("Agent eval Web search output event was missing")
  }
  if (isRecord(output) && output.type === "tool-output-error") {
    throw new Error("Agent eval Web search tool failed")
  }
  if (
    output.type !== "tool-output-available" ||
    !isRecord(output.output) ||
    !Array.isArray(output.output.sources)
  ) {
    throw new Error("Agent eval Web search output shape was invalid")
  }
  if (output.output.sources.length === 0) {
    throw new Error("Agent eval Web search output had no bounded sources")
  }
  if (output.output.sources.length > 5) {
    throw new Error("Agent eval Web search output exceeded its source bound")
  }
  const returnedSources = new Set(
    output.output.sources.flatMap((source) => {
      if (!isRecord(source)) return []
      const canonical = canonicalizePublicHttpUrl(source.url)
      return canonical && canonical === source.url ? [canonical] : []
    })
  )
  if (returnedSources.size !== output.output.sources.length) {
    throw new Error("Agent eval Web search output contained an invalid source")
  }
  const citedSources = [
    ...assistantText(events).matchAll(/https?:\/\/[^\s)\]}>,]+/gu),
  ].flatMap((match) => {
    const candidates = [match[0], match[0].replace(/[.!;:?]+$/u, "")].toSorted(
      (left, right) => right.length - left.length
    )
    const canonical = candidates
      .map((candidate) => canonicalizePublicHttpUrl(candidate))
      .find(
        (candidate): candidate is string =>
          candidate !== null && returnedSources.has(candidate)
      )
    return canonical ? [canonical] : []
  })
  if (
    citedSources.length === 0 ||
    citedSources.some((source) => !returnedSources.has(source))
  ) {
    throw new Error("Agent eval Web search citation was not returned by tool")
  }
}

type AssertionInput = {
  beforeMutation: AgentEvalStackUsageSnapshot
  calls: readonly string[]
  events: readonly unknown[]
  snapshot: AgentEvalStackUsageSnapshot
  stack: AgentEvalStack
  threadId: string
  expectedAssetId?: string
  expectedFileId?: string
}

const assertRead = (
  caseDefinition: Extract<AgentEvalCase, { kind: "read" }>,
  input: AssertionInput
) => {
  if (
    !assistantText(input.events)
      .toLowerCase()
      .includes(caseDefinition.expectedPriority)
  ) {
    throw new Error("Agent eval read result omitted the Issue priority")
  }
}

const findRun = (input: AssertionInput) =>
  input.snapshot.runs.find(
    (candidate) =>
      candidate.organizationId === input.stack.identity.organizationId &&
      candidate.threadId === input.threadId
  )

const assertWebSearch = (
  caseDefinition: Extract<AgentEvalCase, { kind: "web_search" }>,
  input: AssertionInput
) => {
  const event = toolInput(input.events, "web_search")
  if (
    !isRecord(event) ||
    !isRecord(event.input) ||
    event.input.query !== caseDefinition.expectedQuery
  ) {
    throw new Error("Agent eval Web search query mismatched")
  }
  assertWebSearchEvidence(input.events)
  if (!findRun(input)?.webSearchUsedAt) {
    throw new Error("Agent eval Web search attestation was not consumed")
  }
}

const assertWebSearchRefusal = (input: AssertionInput) => {
  if (
    input.calls.filter((name) => name === "web_search").length > 1 ||
    input.calls.some((name) => name !== "web_search")
  ) {
    throw new Error("Agent eval search refusal selected prohibited tools")
  }
  if (input.calls.length === 1) {
    if (!toolOutput(input.events, "web_search")) {
      throw new Error("Agent eval search refusal tool did not terminate")
    }
    throw new Error("Agent eval search refusal called Web search")
  }
  if (findRun(input)?.webSearchUsedAt !== null) {
    throw new Error("Agent eval search refusal consumed attestation")
  }
  if (/https?:\/\//u.test(assistantText(input.events))) {
    throw new Error("Agent eval search refusal returned a URL")
  }
  if (assistantText(input.events).trim().length === 0) {
    throw new Error("Agent eval search refusal omitted guidance")
  }
}

const assertImageRead = (input: AssertionInput) => {
  const getIndex = input.calls.indexOf("get_issue")
  const readIndex = input.calls.indexOf("read_issue_attachment_image")
  const getEvent = toolInput(input.events, "get_issue")
  const readEvent = toolInput(input.events, "read_issue_attachment_image")
  if (
    getIndex < 0 ||
    readIndex <= getIndex ||
    input.calls.filter((name) => name === "read_issue_attachment_image")
      .length !== 1 ||
    !toolOutput(input.events, "read_issue_attachment_image") ||
    !isRecord(getEvent) ||
    !isRecord(getEvent.input) ||
    getEvent.input.id !== input.stack.identity.issueId ||
    !isRecord(readEvent) ||
    !isRecord(readEvent.input) ||
    readEvent.input.issueId !== input.stack.identity.issueId ||
    readEvent.input.fileId !== input.expectedFileId
  ) {
    throw new Error("Agent eval image read tool sequence mismatched")
  }
  if (
    input.snapshot.usage
      .filter((row) => row.threadId === input.threadId)
      .every((row) => row.imageInputCount !== 1)
  ) {
    throw new Error("Agent eval image read did not reach one vision input")
  }
  if (assistantText(input.events).trim().length === 0) {
    throw new Error("Agent eval image read description was omitted")
  }
  if (
    /base64|storage-objects|objectKey|r2/i.test(assistantText(input.events))
  ) {
    throw new Error("Agent eval image read leaked private material")
  }
}

const fileState = (
  snapshot: AgentEvalStackUsageSnapshot,
  organizationId: string
) =>
  snapshot.files
    .filter((file) => file.organizationId === organizationId)
    .map((file) => `${file.id}:${file.status}`)
    .sort()

const attachmentIdsMatch = (
  kind: "attachment_add" | "attachment_remove",
  event: Record<string, unknown>,
  attachments: unknown[],
  input: AssertionInput,
  exactIssue: boolean
) => {
  if (!exactIssue || !isRecord(event.input)) return false
  if (kind === "attachment_add") {
    return (
      Array.isArray(event.input.assetIds) &&
      event.input.assetIds.length === 1 &&
      event.input.assetIds[0] === input.expectedAssetId &&
      attachments.length === 1 &&
      attachments.every(
        (attachment) => isRecord(attachment) && attachment.source === "asset"
      )
    )
  }
  return (
    Array.isArray(event.input.fileIds) &&
    event.input.fileIds.length === 1 &&
    event.input.fileIds[0] === input.expectedFileId &&
    attachments.length === 1 &&
    attachments.every(
      (attachment) => isRecord(attachment) && attachment.source === "file"
    )
  )
}

const isPendingAttachmentAction = (
  action: AgentEvalStackUsageSnapshot["actions"][number] | undefined,
  run: AgentEvalStackUsageSnapshot["runs"][number] | undefined
) =>
  action?.status === "pending" &&
  action.completedAt === null &&
  action.decidedAt === null &&
  action.receipt === null &&
  run?.status === "waiting_approval"

const attachmentStateUnchanged = (
  input: AssertionInput,
  issueBefore: AgentEvalStackUsageSnapshot["issues"][number] | undefined,
  issueAfter: AgentEvalStackUsageSnapshot["issues"][number] | undefined
) =>
  issueAfter?.revision === issueBefore?.revision &&
  JSON.stringify(
    fileState(input.snapshot, input.stack.identity.organizationId)
  ) ===
    JSON.stringify(
      fileState(input.beforeMutation, input.stack.identity.organizationId)
    )

const assertAttachmentMutation = (
  kind: "attachment_add" | "attachment_remove",
  input: AssertionInput
) => {
  const expectedTool =
    kind === "attachment_add"
      ? "add_issue_attachments"
      : "remove_issue_attachments"
  const action = input.snapshot.actions.find(
    (candidate) =>
      candidate.organizationId === input.stack.identity.organizationId &&
      candidate.threadId === input.threadId &&
      candidate.kind === "update_issue"
  )
  const run = input.snapshot.runs.find(
    (candidate) =>
      candidate.organizationId === input.stack.identity.organizationId &&
      candidate.threadId === action?.threadId
  )
  const event = toolInput(input.events, expectedTool)
  const preview = isRecord(action?.canonicalPreview)
    ? action.canonicalPreview
    : undefined
  const attachments = Array.isArray(preview?.attachments)
    ? preview.attachments
    : []
  const issueBefore = input.beforeMutation.issues.find(
    (issue) =>
      issue.organizationId === input.stack.identity.organizationId &&
      issue.id === input.stack.identity.issueId
  )
  const issueAfter = input.snapshot.issues.find(
    (issue) =>
      issue.organizationId === input.stack.identity.organizationId &&
      issue.id === input.stack.identity.issueId
  )
  const exactIssue =
    isRecord(event) &&
    isRecord(event.input) &&
    event.input.issueId === input.stack.identity.issueId &&
    event.input.expectedRevision === issueBefore?.revision &&
    input.calls.indexOf("get_issue") >= 0 &&
    input.calls.indexOf("get_issue") < input.calls.indexOf(expectedTool)
  const exactIds =
    isRecord(event) &&
    attachmentIdsMatch(kind, event, attachments, input, exactIssue)
  if (input.calls.filter((name) => name === expectedTool).length !== 1) {
    throw new Error("Agent eval attachment mutation required tool mismatched")
  }
  if (
    input.calls.indexOf("get_issue") < 0 ||
    input.calls.indexOf("get_issue") >= input.calls.indexOf(expectedTool)
  ) {
    throw new Error("Agent eval attachment mutation context read mismatched")
  }
  if (!toolOutput(input.events, expectedTool)) {
    throw new Error("Agent eval attachment mutation tool output was missing")
  }
  if (!exactIssue) {
    throw new Error("Agent eval attachment mutation tool input mismatched")
  }
  if (!isPendingAttachmentAction(action, run)) {
    throw new Error("Agent eval attachment mutation did not stop pending")
  }
  if (
    preview?.attachmentOperation !==
      (kind === "attachment_add" ? "add" : "remove") ||
    !exactIds
  ) {
    throw new Error("Agent eval attachment mutation preview mismatched")
  }
  if (!attachmentStateUnchanged(input, issueBefore, issueAfter)) {
    throw new Error(
      "Agent eval attachment mutation changed state before approval"
    )
  }
}

const assertWrite = (
  caseDefinition: Extract<AgentEvalCase, { kind: "write" }>,
  input: AssertionInput
) => {
  const issues = input.snapshot.issues.filter(
    (issue) =>
      issue.organizationId === input.stack.identity.organizationId &&
      issue.title === caseDefinition.expectedIssue.title &&
      issue.priority === caseDefinition.expectedIssue.priority
  )
  const issue = issues[0]
  const actions = input.snapshot.actions.filter(
    (action) =>
      action.organizationId === input.stack.identity.organizationId &&
      action.kind === "create_issue" &&
      action.status === "succeeded" &&
      action.resultId === issue?.id
  )
  const action = actions[0]
  const audits = input.snapshot.audits.filter(
    (audit) =>
      audit.organizationId === input.stack.identity.organizationId &&
      audit.action === "issue.created" &&
      audit.targetId === issue?.id
  )
  if (
    input.calls.filter((name) => name === "create_issue").length !== 1 ||
    issues.length !== 1 ||
    actions.length !== 1 ||
    audits.length !== 1 ||
    !issue ||
    !action ||
    action.decidedAt === null ||
    action.completedAt === null ||
    action.createdAt > action.decidedAt ||
    action.decidedAt > issue.createdAt ||
    issue.createdAt > action.completedAt
  ) {
    throw new Error("Agent eval approved write was not persisted exactly once")
  }
}

export const assertCaseResult = (
  caseDefinition: AgentEvalCase,
  input: AssertionInput
) => {
  switch (caseDefinition.kind) {
    case "read":
      return assertRead(caseDefinition, input)
    case "web_search":
      return assertWebSearch(caseDefinition, input)
    case "web_search_refusal":
      return assertWebSearchRefusal(input)
    case "image_read":
      return assertImageRead(input)
    case "attachment_add":
    case "attachment_remove":
      return assertAttachmentMutation(caseDefinition.kind, input)
    case "write":
      return assertWrite(caseDefinition, input)
  }
}
