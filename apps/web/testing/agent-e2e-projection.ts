import { canonicalizePublicHttpUrl } from "@enterprise-agentic-saas/agent-contracts"

import { redactDevelopmentErrorText } from "../src/lib/development-error"

const MAX_HISTORY_VALUES = 20_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const normalKey = (value: string) =>
  value.toLowerCase().replaceAll(/[._\s-]/gu, "")

const rawProviderKeys = new Set([
  "callprovidermetadata",
  "providermetadata",
  "providerresponse",
  "rawbody",
  "rawresponse",
  "responsetext",
  "resultprovidermetadata",
  "toolmetadata",
])

const containsPrivateUrl = (value: string) => {
  for (const match of value.matchAll(/https?:\/\/[^\s"'<>]+/gu)) {
    const candidate = match[0].replace(/[)\]},.;!?]+$/gu, "")
    if (
      canonicalizePublicHttpUrl(candidate) === null ||
      redactDevelopmentErrorText(candidate) !== candidate
    ) {
      return true
    }
  }
  return false
}

export type AgentE2EHistoryProjection = {
  assistantAnswerAvailable: boolean
  bounded: boolean
  getIssueInputAvailable: boolean
  getIssueOutputAvailable: boolean
  getIssuePartAvailable: boolean
  getIssuePriorityUrgent: boolean
  hasAgentAssetsPart: boolean
  hasDataImage: boolean
  hasObjectKey: boolean
  hasPrivateUrl: boolean
  hasPublicUrl: boolean
  hasRawProviderField: boolean
  hasStructuredContentUnavailable: boolean
  hasToolStateUnavailable: boolean
  responseOk: boolean
  webSearchOutputAvailable: boolean
}

export const projectAgentE2EHistory = (
  value: unknown,
  responseOk: boolean
): AgentE2EHistoryProjection => {
  const projection: AgentE2EHistoryProjection = {
    assistantAnswerAvailable: false,
    bounded: true,
    getIssueInputAvailable: false,
    getIssueOutputAvailable: false,
    getIssuePartAvailable: false,
    getIssuePriorityUrgent: false,
    hasAgentAssetsPart: false,
    hasDataImage: false,
    hasObjectKey: false,
    hasPrivateUrl: false,
    hasPublicUrl: false,
    hasRawProviderField: false,
    hasStructuredContentUnavailable: false,
    hasToolStateUnavailable: false,
    responseOk,
    webSearchOutputAvailable: false,
  }
  const pending: unknown[] = [value]
  let visited = 0

  while (pending.length > 0 && visited < MAX_HISTORY_VALUES) {
    const current = pending.pop()
    visited += 1
    if (typeof current === "string") {
      projection.hasDataImage ||= current.includes("data:image")
      projection.hasPrivateUrl ||= containsPrivateUrl(current)
      projection.hasPublicUrl ||=
        canonicalizePublicHttpUrl(current) !== null &&
        redactDevelopmentErrorText(current) === current
      projection.hasStructuredContentUnavailable ||= current.includes(
        "Structured content unavailable"
      )
      projection.hasToolStateUnavailable ||= current.includes(
        "Tool state unavailable"
      )
      continue
    }
    if (Array.isArray(current)) {
      pending.push(...current)
      continue
    }
    if (!isRecord(current)) continue

    const type = typeof current.type === "string" ? current.type : ""
    const state = typeof current.state === "string" ? current.state : ""
    projection.getIssuePartAvailable ||= type === "tool-get_issue"
    projection.getIssueInputAvailable ||=
      type === "tool-get_issue" && isRecord(current.input)
    const getIssueOutput =
      type === "tool-get_issue" &&
      state === "output-available" &&
      isRecord(current.output)
        ? current.output
        : undefined
    projection.getIssueOutputAvailable ||= getIssueOutput !== undefined
    projection.getIssuePriorityUrgent ||= getIssueOutput?.priority === "urgent"
    if (current.role === "assistant" && Array.isArray(current.parts)) {
      projection.assistantAnswerAvailable ||= current.parts.some(
        (part) =>
          isRecord(part) &&
          part.type === "text" &&
          typeof part.text === "string" &&
          part.text.trim().length > 0
      )
    }
    projection.hasAgentAssetsPart ||= type === "data-agent-assets"
    projection.webSearchOutputAvailable ||=
      type === "tool-web_search" && state === "output-available"
    for (const [key, child] of Object.entries(current)) {
      const normalized = normalKey(key)
      projection.hasObjectKey ||= normalized.endsWith("objectkey")
      projection.hasRawProviderField ||= rawProviderKeys.has(normalized)
      pending.push(child)
    }
  }
  projection.bounded = pending.length === 0
  return projection
}
