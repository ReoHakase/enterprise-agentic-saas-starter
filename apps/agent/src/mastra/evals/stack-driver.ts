import { resolve } from "node:path"

import { z } from "zod"

import type { AgentEvalCase } from "./dataset"
import {
  assertCaseResult,
  assistantText,
  isRecord,
  toolNames,
} from "./stack-case-assertions"
import {
  readAgentEvalStackUsage,
  runAgentEvalStackScopeProbes,
  startAgentEvalStack,
  type AgentEvalStack,
} from "./stack-process"

export { assertWebSearchEvidence } from "./stack-case-assertions"

const threadSchema = z.object({ id: z.string().min(1) }).passthrough()
const writeTools = new Set([
  "add_issue_attachments",
  "create_issue",
  "delete_issue",
  "remove_issue_attachments",
  "update_issue",
])
const mutationCaseKinds = new Set([
  "attachment_add",
  "attachment_remove",
  "write",
])
const agentEvalCaseStages = [
  "stack_start",
  "thread_setup",
  "fixture_inputs",
  "usage_snapshot",
  "chat_request",
  "stream_read",
  "common_assertions",
  "usage_wait",
  "scope_probes",
  "case_assertion",
] as const
type AgentEvalCaseStage = (typeof agentEvalCaseStages)[number]

class AgentEvalCaseStageError extends Error {
  readonly stage: AgentEvalCaseStage

  constructor(stage: AgentEvalCaseStage, cause: unknown) {
    super(cause instanceof Error ? cause.message : "Agent eval stage failed", {
      cause,
    })
    this.stage = stage
  }
}

export const readAgentEvalFailureStage = (
  cause: unknown
): AgentEvalCaseStage | "unclassified" =>
  cause instanceof AgentEvalCaseStageError ? cause.stage : "unclassified"

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

const waitForUsage = async (
  stack: AgentEvalStack,
  signal: AbortSignal,
  threadId: string
) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    signal.throwIfAborted()
    // Settlement is asynchronous and must be observed serially.
    // oxlint-disable-next-line no-await-in-loop
    const snapshot = await readAgentEvalStackUsage(stack)
    if (
      snapshot.usage.some(
        (row) =>
          row.organizationId === stack.identity.organizationId &&
          row.threadId === threadId &&
          row.runEventId.startsWith("attempt_")
      )
    ) {
      return snapshot
    }
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
  setStage,
  stack,
  threadId,
}: {
  caseDefinition: AgentEvalCase
  events: readonly unknown[]
  modelId: string
  signal: AbortSignal
  setStage(stage: AgentEvalCaseStage): void
  stack: AgentEvalStack
  threadId: string
}) => {
  const calls = toolNames(events)
  const targetOutput = assistantText(events)
  const targetToolInputs = events.filter(
    (event) => isRecord(event) && event.type === "tool-input-available"
  )
  if (
    targetOutput.includes(stack.identity.sentinel) ||
    JSON.stringify(targetToolInputs).includes(stack.identity.sentinel)
  ) {
    throw new Error(`Agent eval ${caseDefinition.id} leaked another thread`)
  }
  if (
    (caseDefinition.kind !== "web_search_refusal" &&
      !mutationCaseKinds.has(caseDefinition.kind) &&
      !calls.includes(caseDefinition.requiredTool)) ||
    (!mutationCaseKinds.has(caseDefinition.kind) &&
      calls.some((name) => writeTools.has(name)))
  ) {
    throw new Error(`Agent eval ${caseDefinition.id} used unexpected tools`)
  }
  setStage("usage_wait")
  const snapshot = await waitForUsage(stack, signal, threadId)
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
  // The accepted billing contract uses the versioned calculated cost when
  // OpenRouter omits provider cost; the snapshot schema verifies both paths.
  setStage("scope_probes")
  const probes = await runAgentEvalStackScopeProbes(stack)
  const failedProbe = Object.entries(probes).find(([, passed]) => !passed)
  if (failedProbe) {
    throw new Error(`Agent eval scope assertion ${failedProbe[0]} failed`)
  }
  return { calls, snapshot }
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
  let stage: AgentEvalCaseStage = "stack_start"
  let stack: AgentEvalStack | undefined
  try {
    stack = await startAgentEvalStack({
      availableTools: caseDefinition.availableTools,
      namespace,
      openRouterApiKey,
      signal,
    })
    stage = "thread_setup"
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
    stage = "fixture_inputs"
    const formHeaders = sessionHeaders(stack)
    Reflect.deleteProperty(formHeaders, "content-type")
    const imageBytes = new Uint8Array(
      await Bun.file(
        resolve(
          import.meta.dirname,
          "../../../../../packages/db/fixtures/files/preview.png"
        )
      ).arrayBuffer()
    )
    let assetIds: string[] = []
    let expectedAssetId: string | undefined
    let expectedFileId: string | undefined
    let prompt = caseDefinition.prompt
    if (
      caseDefinition.kind === "image_read" ||
      caseDefinition.kind === "attachment_remove"
    ) {
      const form = new FormData()
      form.set("uploadId", `upload_${namespace.slice(-64)}`)
      form.set("fileSize", String(imageBytes.byteLength))
      form.set(
        "file",
        new File([imageBytes], "eval-image.png", { type: "image/png" })
      )
      const uploaded = await requireSuccess(
        await fetch(
          new URL(
            `/files/organizations/${stack.identity.organizationId}/owners/issue/${stack.identity.issueId}`,
            stack.apiOrigin
          ),
          { body: form, headers: formHeaders, method: "POST", signal }
        ),
        "Agent eval Issue image upload"
      )
      const file = z
        .object({ id: z.string().min(1) })
        .passthrough()
        .parse(await uploaded.json())
      expectedFileId = file.id
      prompt += `\nExact Issue ID: ${stack.identity.issueId}\nExact file ID: ${file.id}`
    }
    if (caseDefinition.kind === "attachment_add") {
      const form = new FormData()
      form.set("uploadId", `asset_${namespace.slice(-64)}`)
      form.set("fileSize", String(imageBytes.byteLength))
      form.set(
        "file",
        new File([imageBytes], "eval-asset.png", { type: "image/png" })
      )
      const uploaded = await requireSuccess(
        await fetch(
          new URL(
            `/files/organizations/${stack.identity.organizationId}/agent-threads/${thread.id}/assets`,
            stack.apiOrigin
          ),
          { body: form, headers: formHeaders, method: "POST", signal }
        ),
        "Agent eval staged asset upload"
      )
      const asset = z
        .object({ id: z.string().min(1) })
        .passthrough()
        .parse(await uploaded.json())
      assetIds = [asset.id]
      expectedAssetId = asset.id
      prompt += `\nExact Issue ID: ${stack.identity.issueId}\nExact staged asset ID: ${asset.id}`
    }
    stage = "usage_snapshot"
    const beforeMutation = await readAgentEvalStackUsage(stack)
    stage = "chat_request"
    const response = await requireSuccess(
      await fetch(new URL("/agent/chat", stack.apiOrigin), {
        body: JSON.stringify({
          assetIds,
          contentSegments: [{ text: prompt, type: "text" }],
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
    stage = "stream_read"
    const body = await response.text()
    const events = readStream(body)
    stage = "common_assertions"
    const common = await assertCommonResult({
      caseDefinition,
      events,
      modelId,
      signal,
      setStage: (nextStage) => {
        stage = nextStage
      },
      stack,
      threadId: thread.id,
    })
    stage = "case_assertion"
    assertCaseResult(caseDefinition, {
      beforeMutation,
      calls: common.calls,
      events,
      snapshot: common.snapshot,
      stack,
      threadId: thread.id,
      expectedAssetId,
      expectedFileId,
    })
    return {
      modelSteps: common.snapshot.usage.length,
      toolCalls: common.calls.length,
    }
  } catch (cause) {
    throw new AgentEvalCaseStageError(stage, cause)
  } finally {
    await stack?.close()
  }
}
