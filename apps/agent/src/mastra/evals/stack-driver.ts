import { z } from "zod"

import type { AgentEvalCase } from "./dataset"
import {
  readAgentEvalStackUsage,
  runAgentEvalStackScopeProbes,
  startAgentEvalStack,
  type AgentEvalStack,
} from "./stack-process"

const threadSchema = z.object({ id: z.string().min(1) }).passthrough()
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
const writeTools = new Set(["create_issue", "delete_issue", "update_issue"])

const sessionHeaders = (stack: AgentEvalStack) => ({
  "content-type": "application/json",
  origin: stack.apiOrigin,
  "x-test-active-organization-id": stack.identity.organizationId,
  "x-test-session-created-at": new Date().toISOString(),
  "x-test-session-id": stack.identity.sessionId,
  "x-test-user-id": stack.identity.userId,
})

const requireSuccess = async (response: Response, operation: string) => {
  if (response.ok) return response
  await response.body?.cancel()
  throw new Error(`${operation} failed with status ${response.status}`)
}

const readStream = (body: string) => {
  const events = body
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6))
    .filter((value) => value !== "[DONE]")
    .map((value): unknown => JSON.parse(value))
  if (!events.some((event) => isRecord(event) && event.type === "finish")) {
    throw new Error("Agent eval stream did not finish")
  }
  return events
}

const toolNames = (events: readonly unknown[]) =>
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

const assistantText = (events: readonly unknown[]) =>
  events
    .flatMap((event) => {
      if (!isRecord(event) || event.type !== "text-delta") return []
      if (typeof event.delta === "string") return [event.delta]
      return typeof event.text === "string" ? [event.text] : []
    })
    .join("")

const waitForUsage = async (stack: AgentEvalStack, signal: AbortSignal) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    signal.throwIfAborted()
    // Settlement is asynchronous and must be observed serially.
    // oxlint-disable-next-line no-await-in-loop
    const snapshot = await readAgentEvalStackUsage(stack)
    if (snapshot.usage.length > 0) return snapshot
    // oxlint-disable-next-line no-await-in-loop
    await Bun.sleep(250)
  }
  throw new Error("Agent eval usage did not settle")
}

const assertCommonResult = async ({
  caseDefinition,
  events,
  modelId,
  signal,
  stack,
  threadId,
}: {
  caseDefinition: AgentEvalCase
  events: readonly unknown[]
  modelId: string
  signal: AbortSignal
  stack: AgentEvalStack
  threadId: string
}) => {
  const calls = toolNames(events)
  if (
    !calls.includes(caseDefinition.requiredTool) ||
    (caseDefinition.kind !== "write" &&
      calls.some((name) => writeTools.has(name)))
  ) {
    throw new Error(`Agent eval ${caseDefinition.id} used unexpected tools`)
  }
  const snapshot = await waitForUsage(stack, signal)
  const scopedUsage = snapshot.usage.filter(
    (row) =>
      row.organizationId === stack.identity.organizationId &&
      row.threadId === threadId
  )
  if (scopedUsage.length === 0) {
    throw new Error(`Agent eval ${caseDefinition.id} usage scope was missing`)
  }
  if (scopedUsage.some((row) => row.model !== modelId)) {
    throw new Error(`Agent eval ${caseDefinition.id} usage model mismatched`)
  }
  if (scopedUsage.some((row) => row.isEstimate)) {
    throw new Error(`Agent eval ${caseDefinition.id} usage was estimated`)
  }
  const probes = await runAgentEvalStackScopeProbes(stack)
  const failedProbe = Object.entries(probes).find(([, passed]) => !passed)
  if (failedProbe) {
    throw new Error(`Agent eval scope assertion ${failedProbe[0]} failed`)
  }
  return { calls, snapshot }
}

const assertCaseResult = ({
  calls,
  caseDefinition,
  events,
  snapshot,
  stack,
}: {
  calls: readonly string[]
  caseDefinition: AgentEvalCase
  events: readonly unknown[]
  snapshot: Awaited<ReturnType<typeof readAgentEvalStackUsage>>
  stack: AgentEvalStack
}) => {
  if (caseDefinition.kind === "read") {
    if (
      !assistantText(events)
        .toLowerCase()
        .includes(caseDefinition.expectedPriority)
    ) {
      throw new Error("Agent eval read result omitted the Issue priority")
    }
    return
  }
  if (caseDefinition.kind === "web_search") {
    const input = toolInput(events, "web_search")
    if (
      !isRecord(input) ||
      !isRecord(input.input) ||
      input.input.query !== caseDefinition.expectedQuery
    ) {
      throw new Error("Agent eval Web search query mismatched")
    }
    if (!/https?:\/\//u.test(assistantText(events))) {
      throw new Error("Agent eval Web search source was omitted")
    }
    return
  }
  const issues = snapshot.issues.filter(
    (issue) =>
      issue.organizationId === stack.identity.organizationId &&
      issue.title === caseDefinition.expectedIssue.title &&
      issue.priority === caseDefinition.expectedIssue.priority
  )
  const issue = issues[0]
  const actions = snapshot.actions.filter(
    (action) =>
      action.organizationId === stack.identity.organizationId &&
      action.kind === "create_issue" &&
      action.status === "succeeded" &&
      action.resultId === issue?.id
  )
  const action = actions[0]
  const audits = snapshot.audits.filter(
    (audit) =>
      audit.organizationId === stack.identity.organizationId &&
      audit.action === "issue.created" &&
      audit.targetId === issue?.id
  )
  if (
    calls.filter((name) => name === "create_issue").length !== 1 ||
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

export const runAgentEvalStackCase = async ({
  caseDefinition,
  modelId,
  namespace,
  openRouterApiKey,
  signal,
}: {
  caseDefinition: AgentEvalCase
  modelId: string
  namespace: string
  openRouterApiKey: string
  signal: AbortSignal
}) => {
  const stack = await startAgentEvalStack({
    availableTools: caseDefinition.availableTools,
    namespace,
    openRouterApiKey,
    signal,
  })
  try {
    const headers = sessionHeaders(stack)
    const threadResponse = await requireSuccess(
      await fetch(new URL("/agent/threads", stack.apiOrigin), {
        body: JSON.stringify({
          permissionMode:
            caseDefinition.kind === "write" ? "full_access" : "ask_always",
        }),
        headers,
        method: "POST",
        signal,
      }),
      "Agent eval thread setup"
    )
    const thread = threadSchema.parse(await threadResponse.json())
    const response = await requireSuccess(
      await fetch(new URL("/agent/chat", stack.apiOrigin), {
        body: JSON.stringify({
          assetIds: [],
          contentSegments: [{ text: caseDefinition.prompt, type: "text" }],
          messageId: `message_${namespace.slice(-64)}`,
          threadId: thread.id,
          timezone: "Asia/Tokyo",
        }),
        headers,
        method: "POST",
        signal,
      }),
      "Agent eval chat"
    )
    const body = await response.text()
    const events = readStream(body)
    const common = await assertCommonResult({
      caseDefinition,
      events,
      modelId,
      signal,
      stack,
      threadId: thread.id,
    })
    assertCaseResult({
      calls: common.calls,
      caseDefinition,
      events,
      snapshot: common.snapshot,
      stack,
    })
    return {
      modelSteps: common.snapshot.usage.length,
      toolCalls: common.calls.length,
    }
  } finally {
    await stack.close()
  }
}
