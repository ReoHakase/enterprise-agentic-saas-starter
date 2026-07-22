import type { AgentIssueAction } from "@enterprise-agentic-saas/api/agent-client"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import type { AgentInternalGateway } from "../control-plane/client"
import { createAgentToolBudget } from "./budget"
import {
  agentWriteToolSchemas,
  createActionIdentity,
  createAgentWriteHandlers,
  createAgentWriteTools,
  toSafeActionReceipt,
} from "./write"

const RUN_GRANT = "run_0123456789abcdefghijklmnopqrstuvwxyz"
const ROOT_RUN_ID = "root_run_1"
type WriteApi = Pick<
  AgentInternalGateway,
  | "executeApprovedAction"
  | "prepareCreateIssue"
  | "prepareDeleteIssue"
  | "prepareUpdateIssue"
>

const preview: NonNullable<AgentIssueAction["preview"]> = {
  attachments: [],
  destructive: false,
  fields: [{ after: "Issue", before: null, field: "title" }],
  issueNumber: null,
  issueRevision: null,
  kind: "create_issue",
  title: "Create Issue",
}

const action = (
  status: AgentIssueAction["status"] = "pending"
): AgentIssueAction => ({
  approvalMode: status === "approved" ? "auto_policy" : null,
  completedAt: status === "succeeded" ? "2026-07-22T00:00:00.000Z" : null,
  expiresAt: "2026-07-22T01:00:00.000Z",
  id: "action_1",
  kind: "create_issue",
  preview,
  previewState: "available",
  requiresApproval: status === "pending",
  status,
})

const terminalAction = (kind: AgentIssueAction["kind"]): AgentIssueAction => ({
  approvalMode: null,
  completedAt: "2026-07-22T00:00:00.000Z",
  expiresAt: "2026-07-22T01:00:00.000Z",
  id: `action_${kind}`,
  kind,
  preview: null,
  previewState: "expired",
  requiresApproval: false,
  status: "rejected",
})

const harness = (status: AgentIssueAction["status"] = "pending") => {
  const prepared: Parameters<WriteApi["prepareCreateIssue"]>[0][] = []
  const executeApprovedAction = vi
    .fn<WriteApi["executeApprovedAction"]>()
    .mockResolvedValue({
      actionId: "action_1",
      issue: { deleted: false, id: "issue_1", number: 7, revision: 1 },
      kind: "create_issue",
      status: "succeeded",
    })
  const api: WriteApi = {
    executeApprovedAction,
    prepareCreateIssue: (input) => {
      prepared.push(input)
      return Promise.resolve(action(status))
    },
    prepareDeleteIssue: () => Promise.reject(new Error("not used")),
    prepareUpdateIssue: () => Promise.reject(new Error("not used")),
  }
  const consume = vi.fn<(kind: "client" | "read" | "write") => void>()
  const suspendForApproval = vi.fn<() => void>()
  const holdForApproval = vi.fn<() => void>()
  const handlers = createAgentWriteHandlers(
    api,
    RUN_GRANT,
    { consume, suspendForApproval },
    { holdForApproval },
    ROOT_RUN_ID
  )
  return {
    api,
    consume,
    executeApprovedAction,
    handlers,
    holdForApproval,
    prepared,
    suspendForApproval,
  }
}

describe("agent write schemas", () => {
  it("keeps provider schemas representable as strict JSON Schema", () => {
    for (const schema of Object.values(agentWriteToolSchemas)) {
      expect(z.toJSONSchema(schema)).toMatchObject({
        additionalProperties: false,
        type: "object",
      })
    }
  })

  it("validates bounded create input and rejects unknown fields", () => {
    expect(
      agentWriteToolSchemas.createIssue.parse({
        attachmentAssetIds: ["asset_1", "asset_1"],
        labels: [" bug ", "bug"],
        title: " Issue ",
      })
    ).toEqual({
      attachmentAssetIds: ["asset_1", "asset_1"],
      labels: ["bug", "bug"],
      title: "Issue",
    })
    expect(
      agentWriteToolSchemas.createIssue.safeParse({
        organizationId: "org_1",
        title: "Issue",
      }).success
    ).toBe(false)
  })

  it("requires an expected revision and at least one update field", () => {
    expect(
      agentWriteToolSchemas.updateIssue.safeParse({
        expectedRevision: 1,
        issueId: "issue_1",
      }).success
    ).toBe(false)
    expect(
      agentWriteToolSchemas.updateIssue.safeParse({
        expectedRevision: 1,
        issueId: "issue_1",
        status: "closed",
      }).success
    ).toBe(true)
    expect(
      agentWriteToolSchemas.deleteIssue.safeParse({
        expectedRevision: 0,
        issueId: "issue_1",
      }).success
    ).toBe(false)
  })
})

describe("action identity", () => {
  it("is stable across provider calls in one root run and changes across logical writes", async () => {
    const first = await createActionIdentity(
      "create_issue",
      "call_1",
      { title: "Issue", labels: ["bug"] },
      ROOT_RUN_ID
    )
    const reordered = await createActionIdentity(
      "create_issue",
      "call_1",
      { labels: ["bug"], title: "Issue" },
      ROOT_RUN_ID
    )
    const changedPayload = await createActionIdentity(
      "create_issue",
      "call_1",
      { title: "Other" },
      ROOT_RUN_ID
    )
    const changedCall = await createActionIdentity(
      "create_issue",
      "call_2",
      { title: "Issue", labels: ["bug"] },
      ROOT_RUN_ID
    )
    const changedScope = await createActionIdentity(
      "create_issue",
      "call_1",
      { title: "Issue", labels: ["bug"] },
      "root_run_2"
    )

    expect(first).toEqual(reordered)
    expect(first.idempotencyKey).toMatch(/^v1\.[a-f0-9]{64}$/)
    expect(first.idempotencyKey).not.toBe(changedPayload.idempotencyKey)
    expect(first.idempotencyKey).toBe(changedCall.idempotencyKey)
    expect(first.toolCallId).not.toBe(changedCall.toolCallId)
    expect(first.idempotencyKey).not.toBe(changedScope.idempotencyKey)
  })

  it("hashes a provider tool ID that is unsafe for the internal API", async () => {
    const identity = await createActionIdentity(
      "create_issue",
      "provider/call with secrets",
      { title: "Issue" }
    )
    expect(identity.toolCallId).toMatch(/^call_[a-f0-9]{64}$/)
  })
})

describe("createAgentWriteHandlers", () => {
  it("returns only a safe canonical pending preview and holds settlement", async () => {
    const test = harness("pending")
    const result = await test.handlers.createIssue(
      { attachmentAssetIds: [], title: "Issue" },
      "call_1"
    )

    expect(test.consume).toHaveBeenCalledWith("write")
    expect(test.prepared[0]).toMatchObject({
      grant: RUN_GRANT,
      issue: { attachmentAssetIds: [], title: "Issue" },
      toolCallId: "call_1",
    })
    expect(test.prepared[0]?.idempotencyKey).toMatch(/^v1\.[a-f0-9]{64}$/)
    expect(result).toEqual({
      actionId: "action_1",
      expiresAt: "2026-07-22T01:00:00.000Z",
      preview,
      requiresApproval: true,
      status: "pending",
    })
    expect(test.holdForApproval).toHaveBeenCalledOnce()
    expect(test.suspendForApproval).toHaveBeenCalledOnce()
    expect(test.executeApprovedAction).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain(RUN_GRANT)
  })

  it("suspends the shared tool control after a pending mutation", async () => {
    const test = harness("pending")
    const budget = createAgentToolBudget()
    const handlers = createAgentWriteHandlers(
      test.api,
      RUN_GRANT,
      budget,
      { holdForApproval: vi.fn<() => void>() },
      ROOT_RUN_ID
    )

    await handlers.createIssue({ title: "Issue" }, "call_1")

    for (const kind of ["read", "write", "client"] as const) {
      expect(() => budget.consume(kind)).toThrow(
        "Agent tools suspended for approval"
      )
    }
    expect(test.prepared).toHaveLength(1)
  })

  it("normalizes duplicates and whitespace before prepare", async () => {
    const test = harness("pending")
    await test.handlers.createIssue(
      {
        assigneeId: " member_1 ",
        attachmentAssetIds: ["asset_1", "asset_1"],
        labels: [" bug ", "bug"],
        title: " Issue ",
      },
      "call_1"
    )

    expect(test.prepared[0]?.issue).toEqual({
      assigneeId: "member_1",
      attachmentAssetIds: ["asset_1"],
      labels: ["bug"],
      title: "Issue",
    })
  })

  it("executes an auto-approved action immediately and returns a minimal receipt", async () => {
    const test = harness("approved")

    await expect(
      test.handlers.createIssue({ title: "Issue" }, "call_1")
    ).resolves.toEqual({
      actionId: "action_1",
      issue: { deleted: false, id: "issue_1", number: 7, revision: 1 },
      kind: "create_issue",
      status: "succeeded",
    })
    expect(test.executeApprovedAction).toHaveBeenCalledWith({
      actionId: "action_1",
      grant: RUN_GRANT,
    })
    expect(test.holdForApproval).not.toHaveBeenCalled()
  })

  it("sanitizes every pending preview value without forwarding extra data", async () => {
    const test = harness("pending")
    test.api.prepareCreateIssue = () =>
      Promise.resolve({
        ...action("pending"),
        expiresAt: "x".repeat(100),
        preview: {
          attachments: [
            {
              assetId: "asset_1",
              filename: "safe.webp",
              sizeBytes: 12,
            },
            {
              assetId: "unsafe/id",
              filename: "x".repeat(250),
              sizeBytes: -1,
            },
          ],
          destructive: false,
          fields: [
            { after: ["bug", "x".repeat(250)], before: null, field: "labels" },
            {
              after: "x".repeat(2_100),
              before: "old",
              field: "description",
            },
          ],
          issueNumber: 3,
          issueRevision: -1,
          kind: "create_issue",
          title: "x".repeat(250),
        },
      })

    const result = await test.handlers.createIssue({ title: "Issue" }, "call_1")
    expect(result).toMatchObject({
      actionId: "action_1",
      expiresAt: `${"x".repeat(64)}…`,
      preview: {
        attachments: [
          { assetId: "asset_1", filename: "safe.webp", sizeBytes: 12 },
          {
            assetId: "invalid",
            filename: `${"x".repeat(200)}…`,
            sizeBytes: 0,
          },
        ],
        fields: [
          {
            after: ["bug", `${"x".repeat(200)}…`],
            before: null,
            field: "labels",
          },
          {
            after: `${"x".repeat(2_000)}…`,
            before: "old",
            field: "description",
          },
        ],
        issueNumber: 3,
        issueRevision: null,
        title: `${"x".repeat(200)}…`,
      },
      status: "pending",
    })
  })

  it("returns terminal state without execution and retries succeeded actions by receipt", async () => {
    const rejected = harness("rejected")
    await expect(
      rejected.handlers.createIssue({ title: "Issue" }, "call_1")
    ).resolves.toEqual({
      actionId: "action_1",
      requiresApproval: false,
      status: "rejected",
    })
    expect(rejected.executeApprovedAction).not.toHaveBeenCalled()

    const succeeded = harness("succeeded")
    await succeeded.handlers.createIssue({ title: "Issue" }, "call_1")
    expect(succeeded.executeApprovedAction).toHaveBeenCalledOnce()
  })

  it("rejects invalid internal action and receipt projections", async () => {
    const invalidId = harness("pending")
    invalidId.api.prepareCreateIssue = () =>
      Promise.resolve({ ...action("pending"), id: "unsafe/id" })
    await expect(
      invalidId.handlers.createIssue({ title: "Issue" }, "call_1")
    ).rejects.toThrow("Issue write capability is unavailable")

    const wrongKind = harness("pending")
    wrongKind.api.prepareCreateIssue = () =>
      Promise.resolve({ ...action("pending"), kind: "update_issue" })
    await expect(
      wrongKind.handlers.createIssue({ title: "Issue" }, "call_1")
    ).rejects.toThrow("Issue write capability is unavailable")

    const missingPreview = harness("pending")
    missingPreview.api.prepareCreateIssue = () =>
      Promise.resolve({ ...action("pending"), preview: null })
    await expect(
      missingPreview.handlers.createIssue({ title: "Issue" }, "call_1")
    ).rejects.toThrow("Issue write capability is unavailable")

    const malformedPreview = harness("pending")
    malformedPreview.api.prepareCreateIssue = () => {
      const malformed = action("pending")
      if (malformed.preview !== null) {
        Reflect.set(malformed.preview, "fields", null)
      }
      return Promise.resolve(malformed)
    }
    await expect(
      malformedPreview.handlers.createIssue({ title: "Issue" }, "call_1")
    ).rejects.toThrow("Issue write capability is unavailable")
    expect(malformedPreview.holdForApproval).not.toHaveBeenCalled()
    expect(malformedPreview.suspendForApproval).not.toHaveBeenCalled()

    expect(() =>
      toSafeActionReceipt({
        actionId: "action_1",
        issue: { deleted: false, id: "issue_1", number: 0, revision: 1 },
        kind: "create_issue",
        status: "succeeded",
      })
    ).toThrow("Issue write capability is unavailable")
  })

  it("replaces internal failures with a fixed error", async () => {
    const test = harness("pending")
    test.api.prepareCreateIssue = () =>
      Promise.reject(new Error(`private ${RUN_GRANT}`))

    await expect(
      test.handlers.createIssue({ title: "Issue" }, "call_1")
    ).rejects.toThrow("Issue write capability is unavailable")
    await expect(
      test.handlers.createIssue({ title: "Issue" }, "call_2")
    ).rejects.not.toThrow(RUN_GRANT)
  })
})

describe("createAgentWriteTools", () => {
  it("defines only the three server-side Issue mutation tools", () => {
    const test = harness()
    expect(
      Object.keys(
        createAgentWriteTools(
          test.api,
          RUN_GRANT,
          {
            consume: vi.fn<(kind: "client" | "read" | "write") => void>(),
            suspendForApproval: vi.fn<() => void>(),
          },
          { holdForApproval: vi.fn<() => void>() },
          ROOT_RUN_ID
        )
      ).toSorted()
    ).toEqual(["create_issue", "delete_issue", "update_issue"])
  })

  it("wires create, update, and delete execution to their domain RPCs", async () => {
    const api: WriteApi = {
      executeApprovedAction: () => Promise.reject(new Error("not used")),
      prepareCreateIssue: vi
        .fn<WriteApi["prepareCreateIssue"]>()
        .mockResolvedValue(terminalAction("create_issue")),
      prepareDeleteIssue: vi
        .fn<WriteApi["prepareDeleteIssue"]>()
        .mockResolvedValue(terminalAction("delete_issue")),
      prepareUpdateIssue: vi
        .fn<WriteApi["prepareUpdateIssue"]>()
        .mockResolvedValue(terminalAction("update_issue")),
    }
    const consume = vi.fn<(kind: "client" | "read" | "write") => void>()
    const suspendForApproval = vi.fn<() => void>()
    const tools = createAgentWriteTools(
      api,
      RUN_GRANT,
      { consume, suspendForApproval },
      { holdForApproval: vi.fn<() => void>() },
      ROOT_RUN_ID
    )
    const options = { messages: [], toolCallId: "call_1" }

    await expect(
      tools.create_issue.execute?.({ title: "Issue" }, options)
    ).resolves.toMatchObject({ status: "rejected" })
    await expect(
      tools.update_issue.execute?.(
        {
          expectedRevision: 1,
          issueId: "issue_1",
          status: "closed",
        },
        options
      )
    ).resolves.toMatchObject({ status: "rejected" })
    await expect(
      tools.delete_issue.execute?.(
        { expectedRevision: 1, issueId: "issue_1" },
        options
      )
    ).resolves.toMatchObject({ status: "rejected" })

    expect(api.prepareCreateIssue).toHaveBeenCalledOnce()
    expect(api.prepareUpdateIssue).toHaveBeenCalledOnce()
    expect(api.prepareDeleteIssue).toHaveBeenCalledOnce()
    expect(consume).toHaveBeenCalledTimes(3)
  })
})
